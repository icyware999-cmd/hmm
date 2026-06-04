require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const TICKET_CREATED_CHANNEL_ID = process.env.TICKET_CREATED_CHANNEL_ID;
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID;
const CREATOR_ROLE_ID = process.env.CREATOR_ROLE_ID;

const activeTickets = new Map();
let ticketCounter = 1;

client.once('ready', async () => {
    console.log(`✅ Ticket Bot logged in as ${client.user.tag}`);
    const panelChannel = await client.channels.fetch(TICKET_CREATED_CHANNEL_ID);
    if (panelChannel) {
        await panelChannel.bulkDelete(100).catch(() => {});
        const embed = new EmbedBuilder().setTitle('🎫 Support Tickets').setDescription('Click the button below to create a ticket.').setColor(0x2b2d31);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('📩 Create Ticket').setStyle(ButtonStyle.Primary));
        await panelChannel.send({ embeds: [embed], components: [row] });
    }
});

async function logToChannel(content, embed = null) {
    const logChannel = await client.channels.fetch(TICKET_LOG_CHANNEL_ID);
    if (logChannel) {
        if (embed) await logChannel.send({ embeds: [embed] });
        else await logChannel.send(content);
    }
}

async function createTicket(user, reason = 'No reason') {
    const guild = client.guilds.cache.first();
    const category = await guild.channels.fetch(TICKET_CATEGORY_ID);
    const ticketNum = ticketCounter++;
    const ticketChannel = await guild.channels.create({
        name: `ticket-${user.username}-${ticketNum}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: CREATOR_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ]
    });
    activeTickets.set(ticketChannel.id, { userId: user.id, claimerId: null, createdAt: Date.now(), urgent: false, ticketNum });
    const embed = new EmbedBuilder().setTitle(`🎫 Ticket #${ticketNum}`).setDescription(`Created by: ${user.tag}\nReason: ${reason}\nStatus: Open`).setColor(0x2b2d31);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('🔒 Claim').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('urgent_ticket').setLabel('🚨 Urgent').setStyle(ButtonStyle.Danger)
    );
    await ticketChannel.send({ content: `<@${user.id}> <@&${CREATOR_ROLE_ID}>`, embeds: [embed], components: [row] });
    await logToChannel(`🎫 Ticket #${ticketNum} created by ${user.tag}\nReason: ${reason}`);
    return ticketChannel;
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const ticketData = activeTickets.get(interaction.channelId);
    
    if (interaction.customId === 'create_ticket') {
        await interaction.reply({ content: 'Please type your reason.', ephemeral: true });
        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 });
        if (collected.size > 0) await createTicket(interaction.user, collected.first().content);
        else await interaction.editReply({ content: '❌ Timed out.', ephemeral: true });
    }
    
    else if (interaction.customId === 'claim_ticket') {
        if (!interaction.member.roles.cache.has(CREATOR_ROLE_ID)) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        if (ticketData?.claimerId) return interaction.reply({ content: '❌ Already claimed', ephemeral: true });
        ticketData.claimerId = interaction.user.id;
        activeTickets.set(interaction.channelId, ticketData);
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`✅ Claimed by ${interaction.user.tag}`).setColor(0x00ff00)] });
        await logToChannel(`🔒 Ticket #${ticketData.ticketNum} claimed by ${interaction.user.tag}`);
    }
    
    else if (interaction.customId === 'close_ticket') {
        if (!interaction.member.roles.cache.has(CREATOR_ROLE_ID) && ticketData?.userId !== interaction.user.id) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        await interaction.reply({ content: '✅ Closing in 3 seconds...' });
        setTimeout(async () => {
            const channel = interaction.channel;
            const messages = await channel.messages.fetch({ limit: 50 });
            let transcript = `Ticket #${ticketData?.ticketNum} closed by ${interaction.user.tag}\n`;
            for (const msg of messages.reverse()) transcript += `[${msg[1].createdAt.toLocaleString()}] ${msg[1].author.tag}: ${msg[1].content}\n`;
            await logToChannel(`📝 Transcript\n\`\`\`${transcript.slice(0, 1900)}\`\`\``);
            await channel.delete();
            activeTickets.delete(channel.id);
        }, 3000);
    }
    
    else if (interaction.customId === 'urgent_ticket') {
        if (!interaction.member.roles.cache.has(CREATOR_ROLE_ID)) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        ticketData.urgent = true;
        activeTickets.set(interaction.channelId, ticketData);
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🚨 URGENT - marked by ${interaction.user.tag}`).setColor(0xff0000)] });
        await logToChannel(`🚨 Ticket #${ticketData.ticketNum} marked URGENT`);
        const role = interaction.guild.roles.cache.get(CREATOR_ROLE_ID);
        await interaction.channel.send({ content: `${role} 🚨 URGENT TICKET` });
    }
});

client.once('ready', async () => {
    const guild = client.guilds.cache.first();
    if (guild) await guild.commands.set([
        { name: 'adduser', description: 'Add user to ticket', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        { name: 'removeuser', description: 'Remove user from ticket', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        { name: 'unclaim', description: 'Unclaim this ticket' },
        { name: 'escalate', description: 'Escalate this ticket' }
    ]);
});

client.login(process.env.DISCORD_TICKET_BOT_TOKEN);
