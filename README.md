# Not Fungible Avatars

The official site of **Not Fungible Avatars** and the free trial of **Not Fungible Moments**, the Lisbon edition of THE WALL ARCADE on SuperRare.

> Somebody pulled the rug at the party. You have their photo. They all look alike. Nobody is fungible.

## The game

You run in first person through six places of Lisbon (the metro, the brunch, the main stage, the mint room, the coffee cellar, the rooftop at golden hour) with one photo on your phone. Rows of people come at you in three lanes: run **into** the person on the photo, around everybody else.

- The look-alikes get closer level after level, until they are one trait apart.
- A clean streak makes you run faster and brings closer look-alikes, so the game follows your skill.
- Bump the wrong person and your phone loses a bar, with a joke about who you bumped. Five bars, then it is over.
- A run lasts up to 3 minutes. The last chase is the person this run mints.

## The collection

- **10,000 people at most, on Ethereum**, minted through SuperRare. Never the same person twice.
- 1 credit = 1 run = 1 Not Fungible Avatar. Every trait is earned by playing.
- Tiers come from the levels you clear; Legendary only for catching the one who did it.
- The NFT is an animated GIF of the same pixel person you chased in the game.

## This repository

| Path | What it is |
| --- | --- |
| `public/` | The site: home, `/play/` (the free 60-second trial), `/collection/`, `/game/`, `/mint/` |
| `netlify/functions/` | `/nft.gif` (the animated NFT), `/api/nfa` (metadata), `/api/collection` (OpenSea stats), `/api/mint-signature` |
| `netlify.toml` | Netlify settings: import this repository and they are picked up |

No keys or secrets live here: they stay in Netlify's environment variables. The full paid run is played and scored on SuperRare's server, on THE WALL ARCADE.

A REMIX THE WALL EXPERIMENT · NFC SUMMIT 2027 · LISBON · by [@osaykancuno](https://x.com/osaykancuno)
