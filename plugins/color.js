// PRECIOUS-MD | Color Converter
// Created by Watson Fourpence

export default [{
  command: 'color',
  aliases: ['hexcolor', 'rgbcolor'],
  category: 'tools',
  description: 'Convert HEX and RGB colors',
  cooldown: 3,

  run: async (ctx) => {
    try {
      const input = ctx.args?.join(' ').trim();

      if (!input) {
        return ctx.reply(
          '❌ Usage:\n' +
          '.color #ff0000\n' +
          '.color rgb 255 0 0'
        );
      }

      let r, g, b;

      const rgbMatch = input.match(
        /^rgb\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/i
      );

      if (rgbMatch) {
        [, r, g, b] = rgbMatch.map(Number);

        if ([r, g, b].some(n => n > 255)) {
          return ctx.reply('❌ RGB values must be between 0 and 255.');
        }
      } else {
        const hex = input.replace(/^#/, '');

        if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
          return ctx.reply('❌ Invalid HEX color. Example: .color #ff0000');
        }

        const fullHex = hex.length === 3
          ? hex.split('').map(c => c + c).join('')
          : hex;

        r = parseInt(fullHex.slice(0, 2), 16);
        g = parseInt(fullHex.slice(2, 4), 16);
        b = parseInt(fullHex.slice(4, 6), 16);
      }

      const hex = '#' + [r, g, b]
        .map(n => n.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();

      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      const contrast = brightness >= 128 ? 'Black' : 'White';

      return ctx.reply(
        `╭━━〔 *COLOR INFORMATION* 〕━━╮\n` +
        `┃ 🎨 HEX: ${hex}\n` +
        `┃ 🔴 Red: ${r}\n` +
        `┃ 🟢 Green: ${g}\n` +
        `┃ 🔵 Blue: ${b}\n` +
        `┃ 🌈 RGB: rgb(${r}, ${g}, ${b})\n` +
        `┃ 🖊 Contrast text: ${contrast}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `Created by Watson Fourpence`
      );

    } catch {
      return ctx.reply('❌ Color conversion failed.');
    }
  }
}];