/* =========================
   ENV + SAFETY
========================= */
require("dotenv").config();

if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.HF_TOKEN) {
  console.error("❌ Missing TOKEN, CLIENT_ID, or HF_TOKEN");
  process.exit(1);
}

process.on("unhandledRejection", e => console.error("UnhandledRejection:", e));
process.on("uncaughtException", e => console.error("UncaughtException:", e));

/* =========================
   IMPORTS
========================= */
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

/* =========================
   DISCORD CLIENT
========================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* =========================
   EXPRESS (RENDER KEEP ALIVE)
========================= */
const app = express();
app.get("/", (_, res) => res.send("Author’s Asylum Bot is online"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Web server running"));

/* =========================
   STORAGE
========================= */
const configPath = path.join(__dirname, "config.json");
const loadConfig = () => fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath)) : {};
const saveConfig = data => fs.writeFileSync(configPath, JSON.stringify(data, null, 2));

let botConfig = loadConfig();

/* =========================
   MEME SYSTEM
========================= */
const axiosSafe = axios.create({ timeout: 7000 });

async function sendMeme(channelId) {
  try {
    const res = await axiosSafe.get("https://meme-api.com/gimme");
    const channel = await client.channels.fetch(channelId);
    if (channel && res.data?.url) {
      await channel.send(res.data.url);
    }
  } catch (err) {
    console.error("Meme send error:", err.message);
  }
}

/* =========================
   AI WRITER
========================= */
async function aiWrite(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      { inputs: prompt },
      { headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, "Content-Type": "application/json" }, timeout: 30000 }
    );
    return res.data[0]?.generated_text || "⚠️ AI did not respond.";
  } catch (err) {
    console.error("AI error:", err.message);
    return "⚠️ AI request failed.";
  }
}

/* =========================
   WRITING PROMPTS
========================= */
const prompts = {
  dark: ["The asylum was never abandoned."],
  fantasy: ["Magic disappears overnight."],
  romance: ["Love letters arrive years too late."],
  scifi: ["Earth receives a final warning."]
};
const getPrompt = genre => {
  const pool = prompts[genre] || Object.values(prompts).flat();
  return pool[Math.floor(Math.random() * pool.length)];
};

/* =========================
   SLASH COMMANDS
========================= */
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is alive"),

  new SlashCommandBuilder()
    .setName("prompt")
    .setDescription("Get a writing prompt")
    .addStringOption(o =>
      o.setName("genre")
       .setDescription("Choose a genre: dark, fantasy, romance, scifi")
       .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("setmeme")
    .setDescription("Set the meme channel")
    .addChannelOption(o =>
      o.setName("channel")
       .setDescription("The channel where memes will be sent")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("meme")
    .setDescription("Send a meme immediately"),

  new SlashCommandBuilder()
    .setName("proofread")
    .setDescription("Proofread text (grammar + clarity)")
    .addStringOption(o => o.setName("text").setDescription("Text to proofread").setRequired(true)),

  new SlashCommandBuilder()
    .setName("grammar")
    .setDescription("Fix grammar and spelling")
    .addStringOption(o => o.setName("text").setDescription("Text to fix").setRequired(true)),

  new SlashCommandBuilder()
    .setName("improve")
    .setDescription("Improve clarity and flow")
    .addStringOption(o => o.setName("text").setDescription("Text to improve").setRequired(true)),

  new SlashCommandBuilder()
    .setName("rewrite")
    .setDescription("Rewrite text in a style")
    .addStringOption(o => o.setName("style").setDescription("Rewrite style e.g., formal, casual").setRequired(true))
    .addStringOption(o => o.setName("text").setDescription("Text to rewrite").setRequired(true)),

  new SlashCommandBuilder()
    .setName("tone")
    .setDescription("Change the tone of your text")
    .addStringOption(o => o.setName("tone").setDescription("Tone e.g., friendly, dark, romantic").setRequired(true))
    .addStringOption(o => o.setName("text").setDescription("Text to adjust tone").setRequired(true)),

  new SlashCommandBuilder()
    .setName("shorten")
    .setDescription("Make your text concise")
    .addStringOption(o => o.setName("text").setDescription("Text to shorten").setRequired(true)),

  new SlashCommandBuilder()
    .setName("expand")
    .setDescription("Expand your ideas")
    .addStringOption(o => o.setName("text").setDescription("Text to expand").setRequired(true)),

  new SlashCommandBuilder()
    .setName("title")
    .setDescription("Generate titles for your text")
    .addStringOption(o => o.setName("text").setDescription("Text to generate titles for").setRequired(true)),

  new SlashCommandBuilder()
    .setName("outline")
    .setDescription("Create a writing outline")
    .addStringOption(o => o.setName("text").setDescription("Text to outline").setRequired(true)),

  new SlashCommandBuilder()
    .setName("feedback")
    .setDescription("Get writing feedback")
    .addStringOption(o => o.setName("text").setDescription("Text to review").setRequired(true))
].map(c => c.toJSON());

/* =========================
   REGISTER COMMANDS
========================= */
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error("Command registration error:", err);
  }
})();

/* =========================
   READY & AUTO MEME
========================= */
client.once("ready", () => {
  console.log(`🖤 Logged in as ${client.user.tag}`);

  // Auto meme every 6 minutes
  setInterval(async () => {
    try {
      if (!botConfig.memeChannel) return;
      await sendMeme(botConfig.memeChannel);
    } catch (err) {
      console.error("Auto meme error:", err);
    }
  }, 6 * 60 * 1000);
});

/* =========================
   INTERACTIONS
========================= */
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  try {
    await i.deferReply({ ephemeral: false });

    const text = i.options.getString("text") || "";
    const style = i.options.getString("style") || "creative";
    const tone = i.options.getString("tone") || "friendly";

    switch (i.commandName) {
      case "ping":
        return i.editReply("🖋️ Author’s Asylum is awake.");
      case "prompt":
        return i.editReply(`🩸 **Prompt:** ${getPrompt(i.options.getString("genre"))}`);
      case "setmeme": {
        const ch = i.options.getChannel("channel");
        if (!ch) return i.editReply("⚠️ Channel not found.");
        botConfig.memeChannel = ch.id;
        saveConfig(botConfig);
        return i.editReply("✅ Meme channel set!");
      }
      case "meme": {
        if (!botConfig.memeChannel) return i.editReply("⚠️ Meme channel not set. Use /setmeme first.");
        try {
          await sendMeme(botConfig.memeChannel);
          return i.editReply("😂 Meme sent!");
        } catch {
          return i.editReply("⚠️ Failed to send meme.");
        }
      }
      case "proofread":
        return i.editReply(await aiWrite(`Proofread this text:\n${text}`));
      case "grammar":
        return i.editReply(await aiWrite(`Fix grammar and spelling only:\n${text}`));
      case "improve":
        return i.editReply(await aiWrite(`Improve clarity and flow:\n${text}`));
      case "rewrite":
        return i.editReply(await aiWrite(`Rewrite in ${style} style:\n${text}`));
      case "tone":
        return i.editReply(await aiWrite(`Change tone to ${tone}:\n${text}`));
      case "shorten":
        return i.editReply(await aiWrite(`Make this concise:\n${text}`));
      case "expand":
        return i.editReply(await aiWrite(`Expand this idea:\n${text}`));
      case "title":
        return i.editReply(await aiWrite(`Generate 5 titles for:\n${text}`));
      case "outline":
        return i.editReply(await aiWrite(`Create an outline for:\n${text}`));
      case "feedback":
        return i.editReply(await aiWrite(`Give writing feedback:\n${text}`));
      default:
        return i.editReply("⚠️ Unknown command.");
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (i.deferred) i.editReply("⚠️ Something went wrong. Try again later.");
  }
});

/* =========================
   LOGIN
========================= */
client.login(process.env.TOKEN);
