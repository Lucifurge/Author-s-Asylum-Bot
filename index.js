/* =========================
   ENV + SAFETY
========================= */
require("dotenv").config();

if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.HF_TOKEN) {
  console.error("❌ Missing TOKEN, CLIENT_ID, or HF_TOKEN");
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
   MEME FETCH (WORKING)
========================= */
const axiosSafe = axios.create({ timeout: 7000 });

async function sendMeme(channelId) {
  try {
    const res = await axiosSafe.get("https://meme-api.com/gimme");
    const channel = await client.channels.fetch(channelId);

    if (channel && res.data?.url) {
      await channel.send(res.data.url);
    }
  } catch (e) {
    console.error("Meme error:", e.message);
  }
}

/* =========================
   HUGGING FACE AI
========================= */
async function aiWrite(prompt) {
  const res = await axios.post(
    "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
    { inputs: prompt },
    {
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 20000
    }
  );

  return res.data[0]?.generated_text || "⚠️ AI did not respond.";
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
        .setDescription("dark fantasy romance scifi")
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
    .setDescription("Send a meme"),

  /* ===== WRITER TOOLS ===== */

  new SlashCommandBuilder()
    .setName("proofread")
    .setDescription("Proofread text (grammar + clarity)")
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("grammar")
    .setDescription("Fix grammar and spelling only")
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("improve")
    .setDescription("Improve clarity and flow")
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rewrite")
    .setDescription("Rewrite text in a style")
    .addStringOption(o =>
      o.setName("style")
        .setDescription("formal casual creative academic")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("tone")
    .setDescription("Change tone of text")
    .addStringOption(o =>
      o.setName("tone")
        .setDescription("romantic dark friendly academic")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("shorten")
    .setDescription("Make text concise")
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("expand")
    .setDescription("Expand ideas")
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("title")
    .setDescription("Generate titles")
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("outline")
    .setDescription("Create a writing outline")
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("feedback")
    .setDescription("Get writing feedback")
    .addStringOption(o =>
      o.setName("text").setRequired(true)
    )
].map(c => c.toJSON());

/* =========================
   REGISTER COMMANDS
========================= */
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
  console.log("✅ Slash commands registered");
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
    await i.deferReply();

    const text = i.options.getString("text");
    const style = i.options.getString("style");
    const tone = i.options.getString("tone");

    switch (i.commandName) {
      case "ping":
        return i.editReply("🖋️ Author’s Asylum is awake.");

      case "prompt":
        return i.editReply(`🩸 **Prompt:** ${getPrompt(i.options.getString("genre"))}`);

      case "setmeme": {
        const ch = i.options.getChannel("channel");
        botConfig.memeChannel = ch.id;
        saveConfig(botConfig);
        return i.editReply("✅ Meme channel set!");
      }

      case "meme":
        if (!botConfig.memeChannel)
          return i.editReply("⚠️ Meme channel not set. Use /setmeme first.");
        await sendMeme(botConfig.memeChannel);
        return i.editReply("😂 Meme sent!");

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
    }
  } catch (e) {
    console.error(e);
    if (i.deferred)
      i.editReply("⚠️ Something went wrong.");
  }
});

/* =========================
   LOGIN
========================= */
client.login(process.env.TOKEN);
