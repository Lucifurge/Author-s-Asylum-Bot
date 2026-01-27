require("dotenv").config();
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

/* =========================
   SAFETY
========================= */
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

/* =========================
   CLIENT
========================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

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
const loadData = () =>
  fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath)) : {};
const saveData = d =>
  fs.writeFileSync(dataPath, JSON.stringify(d, null, 2));

let writers = loadData();

/* =========================
   PROMPTS
========================= */
const prompts = {
  dark: [
    "You write letters to someone who died.",
    "The asylum was never abandoned.",
    "A voice narrates your thoughts at night."
  ],
  fantasy: [
    "Magic disappears overnight.",
    "A god wakes up powerless.",
    "A kingdom ruled by lies."
  ],
  romance: [
    "Two people meet only in dreams.",
    "Love letters arrive years too late."
  ],
  sciFi: [
    "Earth receives a final warning.",
    "Memories are now illegal."
  ]
};

const randomPrompt = genre => {
  const pool = prompts[genre] || Object.values(prompts).flat();
  return pool[Math.floor(Math.random() * pool.length)];
};

/* =========================
   SLASH COMMANDS
========================= */
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Bot status"),

  new SlashCommandBuilder().setName("help").setDescription("Show commands"),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your writer profile"),

  new SlashCommandBuilder()
    .setName("prompt")
    .setDescription("Get a writing prompt")
    .addStringOption(o =>
      o.setName("genre")
        .setDescription("dark, fantasy, romance, scifi")
    ),

  new SlashCommandBuilder()
    .setName("write")
    .setDescription("Log a writing session")
    .addIntegerOption(o =>
      o.setName("words")
        .setDescription("Words written")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("outline")
    .setDescription("Create a story outline")
    .addStringOption(o =>
      o.setName("idea")
        .setDescription("Story idea")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rewrite")
    .setDescription("Rewrite text cleaner")
    .addStringOption(o =>
      o.setName("text")
        .setDescription("Text")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("improve")
    .setDescription("Improve flow and clarity")
    .addStringOption(o =>
      o.setName("text")
        .setDescription("Text")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("wordcount")
    .setDescription("Count words")
    .addStringOption(o =>
      o.setName("text")
        .setDescription("Text")
        .setRequired(true)
    )
].map(c => c.toJSON());

/* =========================
   REGISTER
========================= */
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
(async () => {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
})();

/* =========================
   HANDLER
========================= */
client.on("interactionCreate", async i => {
  if (!i.isCommand()) return;

  const userId = i.user.id;
  writers[userId] ??= { words: 0, streak: 0, lastWrite: null };

  try {
    if (i.commandName === "ping")
      return i.reply("🖋️ Author’s Asylum is awake.");

    if (i.commandName === "help") {
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🖤 Author’s Asylum Commands")
            .setDescription(
              "/prompt – writing idea\n" +
              "/write – log writing\n" +
              "/profile – writer stats\n" +
              "/outline – story outline\n" +
              "/rewrite – rewrite text\n" +
              "/improve – improve flow\n" +
              "/wordcount – count words"
            )
            .setColor("#111111")
        ]
      });
    }

    if (i.commandName === "prompt") {
      const genre = i.options.getString("genre");
      return i.reply(`🩸 **Prompt:**\n${randomPrompt(genre)}`);
    }

    if (i.commandName === "write") {
      const words = i.options.getInteger("words");
      const today = new Date().toDateString();

      if (writers[userId].lastWrite !== today)
        writers[userId].streak += 1;

      writers[userId].words += words;
      writers[userId].lastWrite = today;
      saveData(writers);

      return i.reply(`✍️ Logged **${words} words**. Streak: ${writers[userId].streak}`);
    }

    if (i.commandName === "profile") {
      const w = writers[userId];
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🖋️ ${i.user.username}'s Profile`)
            .addFields(
              { name: "Total Words", value: `${w.words}`, inline: true },
              { name: "Streak", value: `${w.streak} days`, inline: true }
            )
            .setColor("#222222")
        ]
      });
    }

    if (i.commandName === "outline") {
      const idea = i.options.getString("idea");
      return i.reply(
        `📚 **Outline**\nBeginning: ${idea}\nMiddle: Conflict\nClimax: Turning point\nEnding: Resolution`
      );
    }

    if (i.commandName === "rewrite") {
      const t = i.options.getString("text");
      return i.reply("✏️ " + t.charAt(0).toUpperCase() + t.slice(1));
    }

    if (i.commandName === "improve") {
      const t = i.options.getString("text");
      return i.reply("✨ " + t.replace(/\s+/g, " ").trim());
    }

    if (i.commandName === "wordcount") {
      const t = i.options.getString("text");
      return i.reply(
        `📊 Words: ${t.trim().split(/\s+/).length} | Characters: ${t.length}`
      );
    }
  } catch (e) {
    console.error(e);
    i.reply("⚠️ The asylum shook, but it stands.");
  }
});

/* =========================
   READY
========================= */
client.once("ready", () => {
  console.log(`🖤 Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
