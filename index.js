/* =========================
   ENV + SAFETY
========================= */
require("dotenv").config();

if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error("❌ Missing TOKEN or CLIENT_ID in environment variables");
  process.exit(1);
}

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

/* =========================
   DISCORD CLIENT
========================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* =========================
   EXPRESS (RENDER KEEP-ALIVE)
========================= */
const app = express();

app.get("/", (_, res) => {
  res.send("Author’s Asylum Bot is online.");
});

app.get("/api/status", (_, res) => {
  res.json({
    online: client.isReady(),
    uptime: Math.floor(process.uptime())
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web server running");
});

/* =========================
   SLASH COMMAND DEFINITIONS
========================= */
const commandData = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is alive"),

  new SlashCommandBuilder()
    .setName("prompt")
    .setDescription("Get a writing prompt")
    .addStringOption(opt =>
      opt
        .setName("genre")
        .setDescription("dark, fantasy, romance, scifi")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("rewrite")
    .setDescription("Rewrite text clearly")
    .addStringOption(opt =>
      opt
        .setName("text")
        .setDescription("Text you want rewritten")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("proofread")
    .setDescription("Proofread your text")
    .addStringOption(opt =>
      opt
        .setName("text")
        .setDescription("Text you want proofread")
        .setRequired(true)
    )
];

/* =========================
   REGISTER COMMANDS (SAFE)
========================= */
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commandData.map(c => c.toJSON()) }
    );
    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error("❌ Slash command registration failed:", err);
  }
})();

/* =========================
   PROMPTS
========================= */
const prompts = {
  dark: [
    "A voice narrates your thoughts at night.",
    "The asylum was never abandoned."
  ],
  fantasy: [
    "Magic disappears overnight.",
    "A god wakes up powerless."
  ],
  romance: [
    "Two people meet only in dreams.",
    "Love letters arrive years too late."
  ],
  scifi: [
    "Memories are illegal.",
    "Earth receives a final warning."
  ]
};

function getPrompt(genre) {
  const pool = prompts[genre] || Object.values(prompts).flat();
  return pool[Math.floor(Math.random() * pool.length)];
}

/* =========================
   BOT READY
========================= */
client.once("ready", () => {
  console.log(`🖤 Logged in as ${client.user.tag}`);
});

/* =========================
   INTERACTIONS
========================= */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case "ping":
        return interaction.reply("🖋️ Author’s Asylum is awake.");

      case "prompt": {
        const genre = interaction.options.getString("genre");
        return interaction.reply(`🩸 **Prompt:** ${getPrompt(genre)}`);
      }

      case "rewrite": {
        const text = interaction.options.getString("text");
        return interaction.reply(`✏️ ${text}`);
      }

      case "proofread": {
        const text = interaction.options.getString("text");
        return interaction.reply(`📝 ${text}`);
      }
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.replied || interaction.deferred) {
      interaction.followUp("⚠️ Something went wrong.");
    } else {
      interaction.reply("⚠️ Something went wrong.");
    }
  }
});

/* =========================
   LOGIN
========================= */
client.login(process.env.TOKEN);
