import bridge from '@vkontakte/vk-bridge';
import { isVkLaunch } from '../api';
import { APP_URL } from './invite';

export interface StoryCard {
  emoji: string;
  /** Big line, e.g. «Серия 30 дней». */
  title: string;
  /** Smaller line, e.g. the goal name. */
  subtitle: string;
  /** Background gradient colors. */
  colors?: [string, string];
}

const WIDTH = 1080;
const HEIGHT = 1920;

/** Splits text into lines that fit `maxWidth` with the current canvas font. */
const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
};

/** Draws the story picture (1080×1920, the VK story format) and returns it as a PNG data URL. */
export const renderStoryImage = ({ emoji, title, subtitle, colors = ['#4f3bb8', '#8e75e6'] }: StoryCard) => {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported');

  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft decorative rings, like the app's summary card.
  context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  context.lineWidth = 80;
  context.beginPath();
  context.arc(WIDTH - 60, 260, 300, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(80, HEIGHT - 300, 220, 0, Math.PI * 2);
  context.stroke();

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '320px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  context.fillText(emoji, WIDTH / 2, 720);

  context.fillStyle = '#ffffff';
  context.font = 'bold 104px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const titleLines = wrapText(context, title, WIDTH - 160);
  titleLines.forEach((line, index) => context.fillText(line, WIDTH / 2, 1080 + index * 120));

  context.fillStyle = 'rgba(255, 255, 255, 0.85)';
  context.font = '56px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const subtitleTop = 1080 + titleLines.length * 120 + 40;
  wrapText(context, subtitle, WIDTH - 200).forEach((line, index) => context.fillText(line, WIDTH / 2, subtitleTop + index * 72));

  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  context.font = 'bold 60px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  context.fillText('Цели вместе', WIDTH / 2, HEIGHT - 260);
  context.fillStyle = 'rgba(255, 255, 255, 0.7)';
  context.font = '44px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  context.fillText('Ставьте цели и поддерживайте друг друга', WIDTH / 2, HEIGHT - 190);

  return canvas.toDataURL('image/png');
};

/**
 * Inside VK: opens the story editor with the picture and an «Открыть» link to the app.
 * Elsewhere: downloads the picture so it can be posted manually.
 */
export const shareStory = async (card: StoryCard): Promise<'shared' | 'downloaded'> => {
  const image = renderStoryImage(card);
  if (isVkLaunch()) {
    await bridge.send('VKWebAppShowStoryBox', {
      background_type: 'image',
      blob: image,
      locked: true,
      attachment: { text: 'open', type: 'url', url: APP_URL },
    });
    return 'shared';
  }
  const link = document.createElement('a');
  link.href = image;
  link.download = 'tseli-vmeste-story.png';
  link.click();
  return 'downloaded';
};
