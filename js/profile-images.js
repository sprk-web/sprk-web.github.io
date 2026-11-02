const presetImages = [
  ["pfp1.webp", "pfp1.jpg"],
  ["pfp2.webp", "pfp2.jpg"],
  ["pfp3.webp", "pfp3.png"],
  ["pfp4.webp", "pfp4.jpg"],
  ["pfp5.webp", "pfp5.png"],
  ["pfp6.webp", "pfp6.jpeg"],
  ["pfp7.webp", "pfp7.jpeg"],
];

export const PRESET_PROFILE_IMAGES = presetImages.map(([file, legacyFile], index) => ({
  label: `Preset ${index + 1}`,
  url: new URL(`../assets/pfps/${file}`, import.meta.url).href,
  legacyUrl: new URL(`../assets/pfps/${legacyFile}`, import.meta.url).href,
}));
