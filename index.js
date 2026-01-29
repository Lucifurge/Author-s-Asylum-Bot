/* =========================
   ENV + SAFETY
========================= */
require("dotenv").config();

if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error("❌ Missing TOKEN or CLIENT_ID");
  process.exit(1);
}

process.on("unhandledRejection", e => console.error(e));
process.on("uncaughtException", e => console.error(e));

/* =========================
   IMPORTS
========================= */
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

/* =========================
   DISCORD CLIENT
========================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* =========================
   EXPRESS (RENDER KEEP ALIVE)
========================= */
const app = express();

app.get("/", (_, res) => res.send("Author’s Asylum Bot is online"));
app.listen(process.env.PORT || 3000, () =>
  console.log("🌐 Web server running")
);

/* =========================
   STORAGE
========================= */
const configPath = path.join(__dirname, "config.json");

function loadConfig() {
  try {
    return fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath))
      : {};
  } catch {
    return {};
  }
}

function saveConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

let botConfig = loadConfig();

/* =========================
   MEME FETCH (SAFE)
========================= */
const axiosSafe = axios.create({ timeout: 7000 });

async function sendMeme(channelId) {
  try {
    const res = await axiosSafe.get("https://meme-api.com/gimme");
    const channel = client.channels.cache.get(channelId);
    if (channel && res.data?.url) {
      await channel.send(res.data.url);
    }
  } catch (e) {
    console.error("Meme error:", e.message);
  }
}

/* =========================
   PROMPTS
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
   SLASH COMMANDS (ALL FIXED)
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
        .setDescription("dark, fantasy, romance, scifi")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("setmeme")
    .setDescription("Set the meme channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel where memes will be sent")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("meme")
    .setDescription("Send a meme now")
].map(c => c.toJSON());

/* =========================
   REGISTER COMMANDS
========================= */
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ Slash commands registered");
  } catch (e) {
    console.error("❌ Command registration failed:", e);
  }
})();

/* =========================
   READY
========================= */
client.once("ready", () => {
  console.log(`🖤 Logged in as ${client.user.tag}`);
});

/* =========================
   INTERACTIONS
========================= */
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  try {
    switch (i.commandName) {
      case "ping":
        return i.reply("🖋️ Author’s Asylum is awake.");

      case "prompt":
        return i.reply(`🩸 **Prompt:** ${getPrompt(i.options.getString("genre"))}`);

      case "setmeme": {
        const ch = i.options.getChannel("channel");
        botConfig.memeChannel = ch.id;
        saveConfig(botConfig);
        await sendMeme(ch.id);
        return i.reply("✅ Meme channel set and meme sent!");
      }

      case "meme": {
        if (!botConfig.memeChannel)
          return i.reply("⚠️ Meme channel not set. Use /setmeme first.");
        await sendMeme(botConfig.memeChannel);
        return i.reply("😂 Meme sent!");
      }
    }
  } catch (e) {
    console.error(e);
    if (i.replied || i.deferred)
      i.followUp("⚠️ Something went wrong.");
    else
      i.reply("⚠️ Something went wrong.");
  }
});

/* =========================
   LOGIN
========================= */
client.login(process.env.TOKEN);
