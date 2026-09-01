type Color = string | RGBA;
type RGBA = { r: number; g: number; b: number; a?: number };

export function interpolateColor(fromColor: Color, toColor: Color, t: number): string {
  // Convert input colors to RGBA format
  const rgba1 = toRgba(fromColor, false);
  const rgba2 = toRgba(toColor, false);

  if (!rgba1 || !rgba2) {
    return ''; // Invalid color input
  }

  //added early exit conditions for optimization
  if (t == 0) {
    if (rgba1.a === undefined) {
      return `rgb(${rgba1.r}, ${rgba1.g}, ${rgba1.b})`;
    } else {
      return `rgb(${rgba1.r}, ${rgba1.g}, ${rgba1.b}, ${rgba1.a})`;
    }
  } else if (t == 1) {
    if (rgba2.a === undefined) {
      return `rgb(${rgba2.r}, ${rgba2.g}, ${rgba2.b})`;
    } else {
      return `rgb(${rgba2.r}, ${rgba2.g}, ${rgba2.b}, ${rgba2.a})`;
    }
  }

  // Interpolate each component
  const r = Math.round(rgba1.r + (rgba2.r - rgba1.r) * t);
  const g = Math.round(rgba1.g + (rgba2.g - rgba1.g) * t);
  const b = Math.round(rgba1.b + (rgba2.b - rgba1.b) * t);
  const a = rgba1.a !== undefined && rgba2.a !== undefined ? rgba1.a + (rgba2.a - rgba1.a) * t : undefined;

  // Return the interpolated color in the same format as the input
  if (a === undefined) {
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
}

function toRgba(color: Color, asString = false): RGBA | null {
  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      // Hex color
      return hexToRgba(color);
    } else if (color.startsWith('rgb')) {
      // RGB or RGBA color
      return cssColorToRgba(color);
    } else {
      return parseColor({ color, asString }) as RGBA;
    }
  } else if (typeof color === 'object' && color.r !== undefined && color.g !== undefined && color.b !== undefined) {
    // Object with r, g, b, (a) properties
    return { r: color.r, g: color.g, b: color.b, a: color.a || 1 };
  }
  return null;
}

function hexToRgba(hex: string): RGBA | null {
  const hexStr = hex.replace('#', '');
  let r,
    g,
    b,
    a = 1;
  if (hexStr.length === 3) {
    // Short hex form: #rgb
    r = parseInt(hexStr[0] + hexStr[0], 16);
    g = parseInt(hexStr[1] + hexStr[1], 16);
    b = parseInt(hexStr[2] + hexStr[2], 16);
  } else if (hexStr.length === 4) {
    // Short hex form with alpha: #rgba
    r = parseInt(hexStr[0] + hexStr[0], 16);
    g = parseInt(hexStr[1] + hexStr[1], 16);
    b = parseInt(hexStr[2] + hexStr[2], 16);
    a = parseInt(hexStr[3] + hexStr[3], 16) / 255;
  } else if (hexStr.length === 6) {
    // Full hex form: #rrggbb
    r = parseInt(hexStr.slice(0, 2), 16);
    g = parseInt(hexStr.slice(2, 4), 16);
    b = parseInt(hexStr.slice(4, 6), 16);
  } else if (hexStr.length === 8) {
    // Hex with alpha: #rrggbbaa
    r = parseInt(hexStr.slice(0, 2), 16);
    g = parseInt(hexStr.slice(2, 4), 16);
    b = parseInt(hexStr.slice(4, 6), 16);
    a = parseInt(hexStr.slice(6, 8), 16) / 255;
  } else {
    return null; // Invalid hex color
  }
  return { r, g, b, a } as RGBA;
}
function cssColorToRgba(color: string): RGBA | null {
  const rgbaMatch = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,]+(\d+(\.\d+)?))?\s*\)/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    return {
      r: parseInt(r),
      g: parseInt(g),
      b: parseInt(b),
      a: a !== undefined ? parseFloat(a) : 1,
    } as RGBA;
  }
  return null; // Invalid CSS color
}

// Color name to hex mapping
const namedColorMap: { [key: string]: string } = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

export function parseColor({
  color,
  withOpacity,
  asString = true,
}: {
  color: string;
  withOpacity?: number | undefined;
  asString?: boolean;
}): string | RGBA | null {
  // Fallback for invalid input.
  if (!color || typeof color !== 'string') {
    return asString ? 'rgba(0, 0, 0, 0)' : ({ r: 0, g: 0, b: 0, a: 0 } as RGBA);
  }

  color = color.toLowerCase();

  // Handle "transparent" keyword.
  if (color === 'transparent') {
    return asString ? 'rgba(0, 0, 0, 0)' : ({ r: 0, g: 0, b: 0, a: 0 } as RGBA);
  }

  // Make sure that the color uses a namedColorMap entry before using its hex value.
  if (namedColorMap[color]) {
    color = namedColorMap[color];
  }

  // Process hex colors.
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = withOpacity !== undefined ? withOpacity : parseInt(hex.slice(6, 8), 16) / 255;
      if (asString) {
        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
      } else {
        return { r, g, b, a } as RGBA;
      }
    } else if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (asString) {
        if (withOpacity !== undefined) {
          return `rgba(${r}, ${g}, ${b}, ${withOpacity})`;
        }
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        if (withOpacity !== undefined) {
          return { r, g, b, a: withOpacity } as RGBA;
        }
        return { r, g, b } as RGBA;
      }
    }
  }

  // For already formatted colors like "rgb(...)" or "rgba(...)", try to parse them.
  const rgbRegex = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,]+([\d.]+))?\s*\)/;
  const match = color.match(rgbRegex);
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const a = match[4] !== undefined ? parseFloat(match[4]) : undefined;
    if (asString) {
      if (withOpacity !== undefined) {
        return `rgba(${r}, ${g}, ${b}, ${withOpacity})`;
      }

      return a !== undefined ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
    } else {
      if (withOpacity !== undefined) {
        return { r, g, b, a: withOpacity } as RGBA;
      }

      return a !== undefined ? ({ r, g, b, a } as RGBA) : ({ r, g, b } as RGBA);
    }
  }

  // Fallback: if the parser cannot recognize the value, return the original color (or a default object).
  return asString ? color : ({ r: 0, g: 0, b: 0, a: 0 } as RGBA);
}
