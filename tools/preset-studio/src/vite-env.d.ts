declare module 'virtual:studio-font-assets' {
  export const fontUrlLoaders: Record<string, () => Promise<string>>;
}
