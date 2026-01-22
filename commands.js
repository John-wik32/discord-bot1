const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('post')
    .setDescription('Post media to a Discord channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to post to')
        .setRequired(true)
    ),
    
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    
    // Check if user has permission
    if (!interaction.member.permissions.has('SEND_MESSAGES')) {
      return interaction.reply({ content: 'You do not have permission to use this command', ephemeral: true });
    }
    
    // Create modal for title input
    const modal = new ModalBuilder()
      .setCustomId('postModal')
      .setTitle('Post to ' + channel.name);
    
    const titleInput = new TextInputBuilder()
      .setCustomId('titleInput')
      .setLabel('Post Title (optional)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('What is this post about?');
    
    const dateInput = new TextInputBuilder()
      .setCustomId('dateInput')
      .setLabel('Schedule Date (leave blank for immediate)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('YYYY-MM-DD or leave blank');
    
    const timeInput = new TextInputBuilder()
      .setCustomId('timeInput')
      .setLabel('Schedule Time (leave blank for immediate)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('HH:MM or leave blank');
    
    const row1 = new ActionRowBuilder().addComponents(titleInput);
    const row2 = new ActionRowBuilder().addComponents(dateInput);
    const row3 = new ActionRowBuilder().addComponents(timeInput);
    
    modal.addComponents(row1, row2, row3);
    
    // Store channel info temporarily
    interaction.client.tempPostData = interaction.client.tempPostData || {};
    interaction.client.tempPostData[interaction.user.id] = {
      channelId: channel.id,
      channelName: channel.name,
      userId: interaction.user.id
    };
    
    await interaction.showModal(modal);
  }
};

// Modal submission handler (add this to main bot file)
async function handleModalSubmit(interaction, discordClient, uploadDir, schedulesDir, sendPostToDiscord, schedulePost) {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== 'postModal') return;
  
  const title = interaction.fields.getTextInputValue('titleInput') || '';
  const schedDate = interaction.fields.getTextInputValue('dateInput') || '';
  const schedTime = interaction.fields.getTextInputValue('timeInput') || '';
  
  const postData = interaction.client.tempPostData?.[interaction.user.id];
  if (!postData) {
    return interaction.reply({ content: 'Error: Could not find post data. Please try again.', ephemeral: true });
  }
  
  // Create embed
  const embed = new EmbedBuilder()
    .setColor('#667eea')
    .setTitle('📤 Media Upload')
    .setDescription(`**Channel:** <#${postData.channelId}>\n**Title:** ${title || '(none)'}\n\nAttach your media files below and choose an action.`)
    .addFields(
      { name: '⏰ Schedule', value: schedDate && schedTime ? `${schedDate} at ${schedTime}` : 'Immediate post' }
    )
    .setFooter({ text: 'You can attach up to 10 files' });
  
  // Create buttons
  const sendButton = new ButtonBuilder()
    .setCustomId('send_now_' + interaction.user.id)
    .setLabel('📤 Send Now')
    .setStyle(ButtonStyle.Primary);
  
  const scheduleButton = new ButtonBuilder()
    .setCustomId('schedule_post_' + interaction.user.id)
    .setLabel('⏰ Schedule')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!schedDate || !schedTime);
  
  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_post_' + interaction.user.id)
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Danger);
  
  const row = new ActionRowBuilder().addComponents(sendButton, scheduleButton, cancelButton);
  
  // Store upload data
  interaction.client.tempPostData[interaction.user.id] = {
    ...postData,
    title,
    schedDate,
    schedTime,
    files: [],
    messageId: null
  };
  
  const msg = await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
    fetchReply: true
  });
  
  interaction.client.tempPostData[interaction.user.id].messageId = msg.id;
}

// Button interaction handler
async function handleButtonInteraction(interaction, discordClient, uploadDir, schedulesDir, sendPostToDiscord, schedulePost) {
  if (!interaction.isButton()) return;
  
  const buttonId = interaction.customId;
  const userId = interaction.user.id;
  
  if (!buttonId.includes(userId)) return;
  
  const postData = interaction.client.tempPostData?.[userId];
  if (!postData) {
    return interaction.reply({ content: 'Session expired. Please use /post again.', ephemeral: true });
  }
  
  if (buttonId.startsWith('cancel_post_')) {
    delete interaction.client.tempPostData[userId];
    return interaction.reply({ content: '❌ Post cancelled.', ephemeral: true });
  }
  
  if (buttonId.startsWith('send_now_')) {
    // Get attachments from the message
    const channel = interaction.channel;
    const messages = await channel.messages.fetch({ limit: 10 });
    let attachments = [];
    
    for (const msg of messages.values()) {
      if (msg.author.id === interaction.client.user.id && msg.embeds.length > 0) {
        attachments = msg.attachments.map(a => ({ name: a.name, url: a.url, id: a.id }));
        break;
      }
    }
    
    if (attachments.length === 0) {
      return interaction.reply({ content: '❌ No files attached. Please attach files and try again.', ephemeral: true });
    }
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Download and save files
      const fetch = await import('node-fetch');
      const files = [];
      
      for (const attachment of attachments) {
        const response = await fetch.default(attachment.url);
        const buffer = await response.buffer();
        const filePath = path.join(uploadDir, `${Date.now()}-${attachment.name}`);
        fs.writeFileSync(filePath, buffer);
        files.push(filePath);
      }
      
      // Send to Discord
      const targetChannel = discordClient.channels.cache.get(postData.channelId);
      await targetChannel.send({
        content: postData.title || '',
        files: files
      });
      
      // Cleanup
      files.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
      delete interaction.client.tempPostData[userId];
      
      interaction.editReply({ content: '✅ Post sent successfully!' });
    } catch (err) {
      interaction.editReply({ content: '❌ Error: ' + err.message });
    }
  }
  
  if (buttonId.startsWith('schedule_post_')) {
    const { schedDate, schedTime, title, channelId } = postData;
    
    if (!schedDate || !schedTime) {
      return interaction.reply({ content: '❌ Schedule date and time are required.', ephemeral: true });
    }
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Get attachments
      const channel = interaction.channel;
      const messages = await channel.messages.fetch({ limit: 10 });
      let attachments = [];
      
      for (const msg of messages.values()) {
        if (msg.author.id === interaction.client.user.id && msg.embeds.length > 0) {
          attachments = msg.attachments.map(a => ({ name: a.name, url: a.url, id: a.id }));
          break;
        }
      }
      
      if (attachments.length === 0) {
        return interaction.editReply({ content: '❌ No files attached. Please attach files and try again.' });
      }
      
      // Download files
      const fetch = await import('node-fetch');
      const files = [];
      
      for (const attachment of attachments) {
        const response = await fetch.default(attachment.url);
        const buffer = await response.buffer();
        const filePath = path.join(uploadDir, `${Date.now()}-${attachment.name}`);
        fs.writeFileSync(filePath, buffer);
        files.push(filePath);
      }
      
      // Create schedule
      const taskId = `task-${Date.now()}`;
      const scheduledTime = new Date(`${schedDate}T${schedTime}`).toISOString();
      const schedData = { id: taskId, channelId, title, files, scheduledTime };
      
      fs.writeFileSync(path.join(schedulesDir, `${taskId}.json`), JSON.stringify(schedData));
      schedulePost(schedData);
      
      delete interaction.client.tempPostData[userId];
      interaction.editReply({ content: `✅ Post scheduled for ${schedDate} at ${schedTime}!` });
    } catch (err) {
      interaction.editReply({ content: '❌ Error: ' + err.message });
    }
  }
}

module.exports.handleModalSubmit = handleModalSubmit;
module.exports.handleButtonInteraction = handleButtonInteraction;
