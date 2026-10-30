const presetFiles = [
  "pfp1.jpg",
  "pfp2.jpg",
  "pfp3.png",
  "pfp4.jpg",
  "pfp5.png",
  "pfp6.jpeg",
  "pfp7.jpeg",
];

export const PRESET_PROFILE_IMAGES = presetFiles.map((file, index) => ({
  label: `Preset ${index + 1}`,
  url: new URL(`../assets/pfps/${file}`, import.meta.url).href,
}));
