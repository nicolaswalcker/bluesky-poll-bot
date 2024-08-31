import { AtpAgent } from '@atproto/api'
import * as dotenv from 'dotenv';

dotenv.config()

const processedMentions = new Set();
const mentionResponses = new Map();
const ONE_MINUTE = 60000;
const ONE_HOUR = 3600000;

const agent = new AtpAgent({
  service: 'https://bsky.social'
})

async function login() {
  const { data } = await agent.login({
    identifier: process.env.BLUESKY_BOT_USERNAME,
    password: process.env.BLUESKY_BOT_PASSWORD
  })

  return { token: data.accessJwt, did: data.did }
}

async function getMentions(token) {
  const { data } = await agent.listNotifications()

  return {
    mentions: data.notifications.filter(n => n.reason === 'mention')
  }
}

async function getMentionText(mention) {
  const mentionText = mention.record.text

  return mentionText.split(',').map(m => m.replace(/@.+\s/, '').trim());
}

async function replyToMention(mention, replyText) {
  if (!mentionResponses.has(mention.cid)) {
    mentionResponses.set(mention.cid, new Set());
  }

  const responses = mentionResponses.get(mention.cid);

  if (responses.has(replyText)) {
    console.log(`Already replied with option: ${replyText}`);
    return { message: `Already replied with option: ${replyText}` };
  }

  console.log('Replying to mention:', mention.cid, 'with option:', replyText);

  await agent.post({
    text: replyText,
    reply: {
      root: {
        uri: mention.uri,
        cid: mention.cid
      },
      parent: {
        uri: mention.uri,
        cid: mention.cid
      }
    }
  })

  responses.add(replyText);

  return { message: 'Replied to mention with option' };
}

async function main() {
  try {
    const startTime = new Date().toLocaleTimeString();
    console.log(`Tick executed ${startTime}`);
    await login()
    const { mentions } = await getMentions();

    if (!mentions.length) {
      console.log('No mentions found');
      return;
    }

    for (const mention of mentions) {
      if (!processedMentions.has(mention.cid)) {
        const mentionText = await getMentionText(mention);
        for (const text of mentionText) {
          await replyToMention(mention, text);
        }
        if (mentionResponses.has(mention.cid) && 
            mentionResponses.get(mention.cid).size === mentionText.length) {
          console.log(`All options processed for mention: ${mention.cid}`);
          processedMentions.add(mention.cid);
          mentionResponses.delete(mention.cid);
        }
      } else {
        console.log(`Mention ${mention.cid} already fully processed`);
      }
    }

    console.log('Processed Mentions:', Array.from(processedMentions));
    console.log('Mention Responses:', Array.from(mentionResponses.entries()));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main()

const mainInterval = setInterval(main, ONE_MINUTE);

const cleanupInterval = setInterval(() => {
  processedMentions.clear();
  mentionResponses.clear();
  console.log('Cleared processed mentions and responses');
}, ONE_HOUR);
