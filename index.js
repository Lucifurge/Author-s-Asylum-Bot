/* =========================
   ENV + SAFETY
========================= */
require("dotenv").config();

["TOKEN", "CLIENT_ID"].forEach(v => {
  if (!process.env[v]) {
    console.error(`❌ Missing ENV: ${v}`);
    process.exit(1);
  }
});

process.on("unhandledRejection", err => console.error("Unhandled Rejection:", err));
process.on("uncaughtException", err => console.error("Uncaught Exception:", err));

/* =========================
   IMPORTS
========================= */
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder 
} = require("discord.js");

const express = require("express");
const fs = require("fs");
const path = require("path");
const nspell = require("nspell");
const dictionary = require("dictionary-en-us");
const axios = require("axios");
const OpenAI = require("openai");

/* =========================
   CLIENT
========================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

/* =========================
   EXPRESS (KEEP-ALIVE)
========================= */
const app = express();
app.use(express.json());

app.get("/api/status", (_, res) => {
  res.json({
    online: client.isReady(),
    servers: client.guilds.cache.size,
    uptime: Math.floor(process.uptime())
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Status server running");
});

/* =========================
   FILE STORAGE
========================= */
const dataPath = path.join(__dirname, "writers.json");
const configPath = path.join(__dirname, "config.json");

const loadJSON = (p, def = {}) => {
  try {
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : def;
  } catch {
    return def;
  }
};

const saveJSON = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2));

let writers = loadJSON(dataPath);
let botConfig = loadJSON(configPath);

/* =========================
   OPENAI
========================= */
const openai = process.env.OPENAI_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_KEY })
  : null;

async function callOpenAI(prompt) {
  if (!openai) return null;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful writing assistant." },
        { role: "user", content: prompt }
      ]
    });
    return res.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("OpenAI error:", e.message);
    return null;
  }
}

/* =========================
   SPELLING (SAFE)
========================= */
let spell = null;

dictionary((err, dict) => {
  if (err) {
    console.error("Dictionary failed:", err);
    return;
  }
  spell = nspell(dict);
});

const suggestWord = word => {
  if (!spell) return word;
  if (spell.correct(word)) return word;
  return spell.suggest(word)[0] || word;
};

/* =========================
   OFFLINE AI
========================= */
function aiRewrite(text) {
  return text
    .split(/[.!?]/)
    .map(s =>
      s
        .trim()
        .replace(/\b(\w+)\s+\1\b/gi, "$1")
        .replace(/\b\w+\b/g, w => suggestWord(w))
        .replace(/^./, c => c.toUpperCase())
    )
    .join(" ");
}

function aiProofread(text) {
  const issues = [];
  let fixed = text.replace(/\b\w+\b/g, w => {
    const c = suggestWord(w);
    if (c !== w) issues.push(`"${w}" → "${c}"`);
    return c;
  });
  return {
    fixedText: fixed,
    issues: issues.length ? issues : ["No major issues found"]
  };
}

/* =========================
   PROMPTS
========================= */
const prompts = {
  dark: ["A voice narrates your thoughts.", "The asylum was never abandoned."],
  fantasy: ["Magic disappears overnight.", "A god wakes up powerless."],
  romance: ["Love letters arrive too late.", "Two people meet only in dreams."],
  scifi: ["Memories are illegal.", "Earth receives a final warning."]
};

const randomPrompt = genre => {
  const pool = prompts[genre] || Object.values(prompts).flat();
  return pool[Math.floor(Math.random() * pool.length)];
};

/* =========================
   AXIOS SAFE
========================= */
const axiosSafe = axios.create({ timeout: 7000 });

async function sendMeme(channelId) {
  try {
    const res = await axiosSafe.get("https://meme-api.com/gimme");
    const channel = client.channels.cache.get(channelId);
    if (channel && res.data?.url) await channel.send(res.data.url);
  } catch (e) {
    console.error("Meme error:", e.message);
  }
}

async function sendDailyVerse() {
  if (!botConfig.dailyVerseChannel) return;
  try {
    const res = await axiosSafe.get("https://bible-api.com/john 3:16");
    const ch = client.channels.cache.get(botConfig.dailyVerseChannel);
    if (ch && res.data?.text) {
      ch.send(`📖 ${res.data.reference}\n${res.data.text}`);
    }
  } catch (e) {
    console.error("Verse error:", e.message);
  }
}

/* =========================
   READY
========================= */
client.once("ready", () => {
  console.log(`🖤 Logged in as ${client.user.tag}`);

  if (botConfig.memeChannel) sendMeme(botConfig.memeChannel);
  setInterval(() => botConfig.memeChannel && sendMeme(botConfig.memeChannel), 15 * 60 * 1000);

  if (botConfig.dailyVerseChannel) sendDailyVerse();
  setInterval(sendDailyVerse, 24 * 60 * 60 * 1000);
});

/* =========================
   COMMANDS
========================= */
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Bot status"),
  new SlashCommandBuilder().setName("prompt").setDescription("Get a writing prompt")
    .addStringOption(o => o.setName("genre").setDescription("dark, fantasy, romance, scifi")),
  new SlashCommandBuilder().setName("rewrite").setDescription("Rewrite text")
    .addStringOption(o => o.setName("text").setRequired(true)),
  new SlashCommandBuilder().setName("proofread").setDescription("Proofread text")
    .addStringOption(o => o.setName("text").setRequired(true)),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Commands registered");
  } catch (e) {
    console.error("❌ Command registration failed:", e);
  }
})();

/* =========================
   INTERACTIONS
========================= */
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  try {
    if (i.commandName === "ping")
      return i.reply("🖋️ Author’s Asylum is awake.");

    if (i.commandName === "prompt")
      return i.reply(`🩸 **Prompt:** ${randomPrompt(i.options.getString("genre"))}`);

    if (i.commandName === "rewrite") {
      const t = i.options.getString("text");
      const ai = await callOpenAI(`Rewrite this:\n${t}`);
      return i.reply(ai || aiRewrite(t));
    }

    if (i.commandName === "proofread") {
      const t = i.options.getString("text");
      const ai = await callOpenAI(`Proofread this:\n${t}`);
      const off = aiProofread(t);
      return i.reply(ai || off.fixedText);
    }
  } catch (e) {
    console.error(e);
    if (i.replied || i.deferred)
      i.followUp("⚠️ Something shook the asylum.");
    else
      i.reply("⚠️ Something shook the asylum.");
  }
});

/* =========================
   LOGIN
========================= */
client.login(process.env.TOKEN);
