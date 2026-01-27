require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const express = require("express");
const fs = require("fs");
const path = require("path");
const nspell = require("nspell");
const dictionary = require("dictionary-en-us");
const axios = require("axios");
const OpenAI = require("openai");

/* =========================
   SAFETY
========================= */
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

/* =========================
   CLIENT
========================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

/* =========================
   EXPRESS STATUS
========================= */
const app = express();
app.get("/api/status", (_, res) => {
  res.json({
    online: client.isReady(),
    servers: client.guilds.cache.size,
    uptime: Math.floor(process.uptime())
  });
});
app.listen(process.env.PORT || 3000);

/* =========================
   DATA STORAGE
========================= */
const dataPath = path.join(__dirname, "writers.json");
const configPath = path.join(__dirname, "config.json");

const loadData = () => fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath)) : {};
const saveData = d => fs.writeFileSync(dataPath, JSON.stringify(d, null, 2));

const loadConfig = () => fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath)) : {};
const saveConfig = d => fs.writeFileSync(configPath, JSON.stringify(d, null, 2));

let writers = loadData();
let botConfig = loadConfig();

/* =========================
   OPENAI SETUP
========================= */
const openai = process.env.OPENAI_KEY ? new OpenAI({ apiKey: process.env.OPENAI_KEY }) : null;

async function callOpenAI(prompt) {
  if (!openai) return null;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a smart writing assistant that corrects grammar, improves style, and rewrites text clearly." },
        { role: "user", content: prompt }
      ]
    });
    return res.choices[0].message.content.trim();
  } catch (e) {
    console.error("OpenAI API error:", e);
    return null;
  }
}

/* =========================
   PROMPTS
========================= */
const prompts = {
  dark: ["You write letters to someone who died.", "The asylum was never abandoned.", "A voice narrates your thoughts at night."],
  fantasy: ["Magic disappears overnight.", "A god wakes up powerless.", "A kingdom ruled by lies."],
  romance: ["Two people meet only in dreams.", "Love letters arrive years too late."],
  sciFi: ["Earth receives a final warning.", "Memories are now illegal."]
};
const randomPrompt = genre => {
  const pool = prompts[genre] || Object.values(prompts).flat();
  return pool[Math.floor(Math.random() * pool.length)];
};

/* =========================
   OFFLINE PROOFREAD / REWRITE / IMPROVE
========================= */
let spell;
dictionary((err, dict) => { if (err) throw err; spell = nspell(dict); });

function suggestWord(word) {
  if (spell.correct(word)) return word;
  const suggestions = spell.suggest(word);
  return suggestions.length ? suggestions[0] : word;
}

function aiProofread(text) {
  const issues = [];
  let fixedText = text.replace(/\b\w+\b/g, word => {
    const corrected = suggestWord(word);
    if (corrected !== word) issues.push(`Spelling: "${word}" → "${corrected}"`);
    return corrected;
  });
  fixedText = fixedText.replace(/\b(\w+)\s+\1\b/gi, (m, p1) => { issues.push(`Removed repeated word: "${p1}"`); return p1; });
  fixedText = fixedText.replace(/(^|[.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
  fixedText = fixedText.replace(/\s+([,.!?])/g, "$1").replace(/\s+/g, " ");
  text.split(/[.!?]/).forEach(s => { if (s.trim().split(" ").length > 30) issues.push("Long sentence detected (30+ words)"); });
  if (/\b(was|were|is|are|been|being)\s+\w+ed\b/i.test(text)) issues.push("Possible passive voice usage");
  return { fixedText: fixedText.trim(), issues: issues.length ? issues : ["No major issues found"] };
}

function aiRewrite(text) { return text.split(/[.!?]/).map(s => s.trim().replace(/\b(\w+)\s+\1\b/gi, "$1").replace(/\b\w+\b/g, word => suggestWord(word)).replace(/^./, c => c.toUpperCase())).join(" "); }
function aiImprove(text) { return aiRewrite(text).replace(/(.{60,}?)(,|\s)/g, "$1.$2"); }

/* =========================
   AUTO MEME + DAILY VERSE
========================= */
async function sendMeme(channelId) {
  try {
    const res = await axios.get("https://meme-api.com/gimme");
    if (res.data && res.data.url) {
      const channel = client.channels.cache.get(channelId);
      if (channel) await channel.send({ content: res.data.url });
      return res.data.url;
    }
  } catch (e) {
    console.error("Error fetching meme:", e);
    return null;
  }
}

async function sendDailyVerse() {
  if (!botConfig.dailyVerseChannel) return;
  const channel = client.channels.cache.get(botConfig.dailyVerseChannel);
  if (!channel) return;
  try {
    const res = await axios.get("https://bible-api.com/john 3:16");
    if (res.data && res.data.text) channel.send({ content: `📖 ${res.data.reference} - ${res.data.text}` });
  } catch (e) { console.error("Error fetching verse:", e); }
}

/* Start intervals */
client.once("ready", () => {
  console.log(`🖤 Logged in as ${client.user.tag}`);
  if (botConfig.memeChannel) sendMeme(botConfig.memeChannel);
  setInterval(() => { if (botConfig.memeChannel) sendMeme(botConfig.memeChannel); }, 15 * 60 * 1000);
  if (botConfig.dailyVerseChannel) sendDailyVerse();
  setInterval(() => { if (botConfig.dailyVerseChannel) sendDailyVerse(); }, 24 * 60 * 60 * 1000);
});

/* =========================
   SLASH COMMANDS
========================= */
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Bot status"),
  new SlashCommandBuilder().setName("help").setDescription("Show commands"),
  new SlashCommandBuilder().setName("profile").setDescription("View your writer profile"),
  new SlashCommandBuilder().setName("prompt").setDescription("Get a writing prompt").addStringOption(o => o.setName("genre").setDescription("dark, fantasy, romance, scifi")),
  new SlashCommandBuilder().setName("write").setDescription("Log a writing session").addIntegerOption(o => o.setName("words").setDescription("Words written").setRequired(true)),
  new SlashCommandBuilder().setName("outline").setDescription("Create a story outline").addStringOption(o => o.setName("idea").setDescription("Story idea").setRequired(true)),
  new SlashCommandBuilder().setName("rewrite").setDescription("Rewrite text smarter").addStringOption(o => o.setName("text").setDescription("Text to rewrite").setRequired(true)),
  new SlashCommandBuilder().setName("improve").setDescription("Improve flow and clarity").addStringOption(o => o.setName("text").setDescription("Text to improve").setRequired(true)),
  new SlashCommandBuilder().setName("wordcount").setDescription("Count words").addStringOption(o => o.setName("text").setDescription("Text to count").setRequired(true)),
  new SlashCommandBuilder().setName("proofread").setDescription("AI-style proofreading").addStringOption(o => o.setName("text").setDescription("Text to proofread").setRequired(true)),
  new SlashCommandBuilder().setName("setmeme").setDescription("Set meme channel").addChannelOption(o => o.setName("channel").setDescription("Channel for memes").setRequired(true)),
  new SlashCommandBuilder().setName("setverse").setDescription("Set daily verse channel").addChannelOption(o => o.setName("channel").setDescription("Channel for daily verse").setRequired(true)),
  new SlashCommandBuilder().setName("meme").setDescription("Generate a meme instantly")
].map(c => c.toJSON());

/* =========================
   REGISTER COMMANDS
========================= */
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log("✅ Commands registered");
})();

/* =========================
   COMMAND HANDLER
========================= */
client.on("interactionCreate", async i => {
  if (!i.isCommand()) return;
  const userId = i.user.id;
  writers[userId] ??= { words: 0, streak: 0, lastWrite: null };

  try {
    switch (i.commandName) {
      case "ping": return i.reply("🖋️ Author’s Asylum is awake.");
      case "help": return i.reply({ embeds: [new EmbedBuilder().setTitle("🖤 Commands").setDescription("/prompt, /write, /profile, /outline, /rewrite, /improve, /proofread, /wordcount, /setmeme, /setverse, /meme").setColor("#111111")] });
      case "prompt": return i.reply(`🩸 **Prompt:**\n${randomPrompt(i.options.getString("genre"))}`);
      case "write": {
        const words = i.options.getInteger("words"); const today = new Date().toDateString();
        if (writers[userId].lastWrite !== today) writers[userId].streak++;
        writers[userId].words += words; writers[userId].lastWrite = today; saveData(writers);
        return i.reply(`✍️ Logged **${words} words** | Streak: ${writers[userId].streak}`);
      }
      case "profile": {
        const w = writers[userId];
        return i.reply({ embeds: [new EmbedBuilder().setTitle(`🖋️ ${i.user.username}'s Profile`).addFields({ name: "Total Words", value: `${w.words}`, inline: true }, { name: "Streak", value: `${w.streak} days`, inline: true }).setColor("#222222")] });
      }
      case "outline": return i.reply(`📚 **Outline**\nBeginning: ${i.options.getString("idea")}\nMiddle: Conflict\nClimax: Turning point\nEnding: Resolution`);
      case "rewrite": {
        const text = i.options.getString("text");
        const ai = await callOpenAI(`Rewrite this text clearly and grammatically:\n${text}`);
        return i.reply("✏️ " + (ai || aiRewrite(text)));
      }
      case "improve": {
        const text = i.options.getString("text");
        const ai = await callOpenAI(`Improve the flow and clarity of this text:\n${text}`);
        return i.reply("✨ " + (ai || aiImprove(text)));
      }
      case "wordcount": {
        const t = i.options.getString("text");
        return i.reply(`📊 Words: ${t.trim().split(/\s+/).length} | Characters: ${t.length}`);
      }
      case "proofread": {
        const text = i.options.getString("text");
        const ai = await callOpenAI(`Proofread this text and suggest corrections:\n${text}`);
        const offline = aiProofread(text);
        return i.reply({ embeds: [new EmbedBuilder().setTitle("📝 Proofreading Report").addFields({ name: "Issues", value: (ai || offline.issues.join("\n")).slice(0,1024) }, { name: "Suggested Fix", value: (ai || offline.fixedText).slice(0,1024) }).setColor("#444444")] });
      }
      case "setmeme": {
        botConfig.memeChannel = i.options.getChannel("channel").id;
        saveConfig(botConfig);
        sendMeme(botConfig.memeChannel); // send immediately
        return i.reply("✅ Meme channel set and meme sent!");
      }
      case "setverse": {
        botConfig.dailyVerseChannel = i.options.getChannel("channel").id;
        saveConfig(botConfig);
        sendDailyVerse(); // send immediately
        return i.reply("✅ Daily verse channel set and verse sent!");
      }
      case "meme": {
        if (!botConfig.memeChannel) return i.reply("⚠️ Meme channel is not set. Use /setmeme first.");
        const url = await sendMeme(botConfig.memeChannel);
        return i.reply(url ? "😂 Meme sent!" : "⚠️ Failed to fetch a meme.");
      }
    }
  } catch (e) {
    console.error(e);
    i.reply("⚠️ The asylum shook, but it stands.");
  }
});

client.login(process.env.TOKEN);
