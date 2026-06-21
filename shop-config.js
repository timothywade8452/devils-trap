// Devil's Trap — Soul-pack (in-app-purchase) config.
// This is a static site, so real-money fulfilment needs a payment link YOU control. Drop a
// Payment Link per pack (Stripe Payment Link / Gumroad / Ko-fi / Lemon Squeezy / Paddle…) and it
// goes live instantly — no backend, no build step.
//
//   buyUrl: ""          -> the pack shows "Coming soon" (display-only, no purchase).
//   buyUrl: "https://…" -> clicking the pack opens that checkout in a new tab.
//
// Souls earned by PLAYING work with zero setup; packs are optional. After a buyer pays, credit
// them with a redeem code or a webhook flow you host. Never put secret keys in this file.

export const SHOP_CONFIG = {
  note: "Souls are 100% earnable by playing — packs are optional and only activate once you add a payment link in shop-config.js.",
  packs: [
    { id: "pack_s",  name: "Pouch of Souls", souls: 500,   priceLabel: "$0.99", buyUrl: "" },
    { id: "pack_m",  name: "Sack of Souls",  souls: 1500,  priceLabel: "$2.49", buyUrl: "" },
    { id: "pack_l",  name: "Hoard of Souls", souls: 4000,  priceLabel: "$4.99", buyUrl: "", best: true },
    { id: "pack_xl", name: "Devil's Vault",  souls: 12000, priceLabel: "$9.99", buyUrl: "" },
  ],
};
