import { useColorScheme } from 'react-native';

const light = {
  dark: false, background: '#ffffff', text: '#181818', secondary: '#777777', muted: '#999999',
  surface: '#f6f6f6', line: '#e9e9e9', glass: 'rgba(255,255,255,0.65)',
  selected: 'rgba(0,0,0,0.065)', fade: '#ffffffd9', transparent: '#ffffff00',
};
const dark: typeof light = {
  dark: true, background: '#141516', text: '#f7f7f7', secondary: '#b0b1b3', muted: '#939598',
  surface: '#252729', line: '#323436', glass: 'rgba(38,40,42,0.6)',
  selected: 'rgba(255,255,255,0.14)', fade: '#141516e6', transparent: '#14151600',
};
export type Palette = typeof light;
export function usePalette(): Palette { return useColorScheme() === 'dark' ? dark : light; }
