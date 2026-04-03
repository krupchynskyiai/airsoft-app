const RARITIES = {
  common:    { color: "rgb(75, 105, 255)",  baseChance: 0.7992 }, // 79.92%
  rare:      { color: "rgb(136, 71, 255)",  baseChance: 0.1598 }, // 15.98%
  epic:      { color: "rgb(211, 44, 230)",  baseChance: 0.032  }, // 3.2%
  legendary: { color: "rgb(235, 75, 75)",   baseChance: 0.0064 }, // 0.64%
  mythic:    { color: "rgb(255, 229, 0)",   baseChance: 0.0 }, // 0.26%
};

const LOOT_REWARDS = [
  {
    key: "discount_20",
    title: "Знижка 20%",
    description: "Знижка 20% на участь у грі.",
    rarity: "common",
    weight: 1,
    imageUrl: "/gifts/sale-20.png",
    enabled: true,
  },
  {
    key: "balls_50",
    title: "50 куль",
    description: "50 куль для гри.",
    rarity: "common",
    weight: 1,
    imageUrl: "/gifts/balls-50.png",
    enabled: true,
  },
  {
    key: "discount_50",
    title: "Знижка 50%",
    description: "Знижка 50% на участь у грі.",
    rarity: "rare",
    weight: 1,
    imageUrl: "/gifts/sale-50.png",
    enabled: true,
  },
  {
    key: "free_game",
    title: "Безкоштовна участь",
    description: "Один безкоштовний вхід на гру.",
    rarity: "epic",
    weight: 1,
    imageUrl: "/gifts/free-game.png",
    enabled: true,
  },
  {
    key: "custom_patch",
    title: "Кастомний патч 7x6.5",
    description: "Індивідуальний патч за твоїм дизайном.",
    rarity: "epic",
    weight: 1,
    imageUrl: "/gifts/patch.png",
    enabled: true,
  },
  {
    key: "mp5_mag_refill",
    title: "Поповнення MP5",
    description: "Безкоштовне поповнення магазину MP5.",
    rarity: "rare",
    weight: 1,
    imageUrl: "/gifts/mp5-mag.png",
    enabled: true,
  },
  {
    key: "g36_mag_refill",
    title: "Поповнення G36",
    description: "Безкоштовне поповнення магазину G36.",
    rarity: "rare",
    weight: 1,
    imageUrl: "/gifts/g36-mag.png",
    enabled: true,
  },
  {
    key: "ak74_mag_refill",
    title: "Поповнення АК-74",
    description: "Безкоштовне поповнення магазину АК-74.",
    rarity: "rare",
    weight: 1,
    imageUrl: "/gifts/ak74-mag.png",
    enabled: true,
  },
  {
    key: "smoke_grenade",
    title: "Димова граната",
    description: "1 димова граната.",
    rarity: "rare",
    weight: 1,
    imageUrl: "/gifts/smoke.png",
    enabled: true,
  },
  {
    key: "rpg_shot",
    title: "RPG + 1 снаряд",
    description: "Один снаряд з RPG на грі.",
    rarity: "legendary",
    weight: 1,
    imageUrl: "/gifts/rpg.png",
    enabled: true,
  },
  {
    key: "balls-pack",
    title: "Пакунок куль",
    description: "Пакунок з 4000 куль для гри.",
    rarity: "legendary",
    weight: 1,
    imageUrl: "/gifts/balls-pack.png",
    enabled: true,
  },
  {
    key: "grenade",
    title: "Граната",
    description: "1 ігрова граната.",
    rarity: "rare",
    weight: 1,
    imageUrl: "/gifts/grenade.png",
    enabled: true,
  },
  {
    key: "colt_ec_3101_east_crane",
    title: "Colt EC-3101 East Crane",
    description: "Топ приз.",
    rarity: "mythic",
    weight: 1,
    imageUrl: "/gifts/colt_ec_3101_east_crane.png",
    enabled: true,
  },
  {
    key: "eotech_553_black",
    title: "Коліматорний приціл",
    description: "Приціл коліматорний EoTech 553 - BLACK",
    rarity: "mythic",
    weight: 1,
    imageUrl: "/gifts/eotech553.png",
    enabled: true,
  },
];

module.exports = { RARITIES, LOOT_REWARDS };

