/*
 * A Not Fungible Avatar as an agent: its voice comes from its traits (role, expression, item, moment).
 * Used by the site (the Agents tab) and by the function /api/agent. Plain rules, no model and no secret: the same words
 * for the same traits and the same message, so anyone can check them. /api/agent can put a free model in front of reply().
 */
const ROLES = [
  { bio: 'I paint first and explain never.', gm: 'gm. Careful, the paint is wet.', rug: 'A rug is just a canvas that left. I would frame it.', floor: 'I do not check the floor. I paint on it.', quips: ['Everything is a study for something bigger.', 'This conversation is now part of the piece.'] },
  { bio: 'I have seen every floor in this city.', gm: 'gm. What are you holding?', rug: 'Pulled? I bought that rug at the bottom.', floor: 'Floors are for looking down at. I look at provenance.', quips: ['I will take it. Whatever it is.', 'Send me the link. I am listening. Barely.'] },
  { bio: 'I ship at 3 am and demo at 9.', gm: 'gm. Have you tried turning off your wallet?', rug: 'I read the contract. Line 42 said it all.', floor: 'Not a price person. Mainnet moved again, by the way.', quips: ['It works on my machine.', 'That is not a bug, it is on the roadmap.'] },
  { bio: 'I am pitching you right now, and you did not notice.', gm: 'gm. Quick question: are you raising?', rug: 'We prefer the term unscheduled pivot.', floor: 'We are pre-floor. Very early.', quips: ['Picture this, but on-chain.', 'We are basically the next layer of everything.'] },
  { bio: 'I decide what is interesting. Today it is not this.', gm: 'gm. The light in here is doing a lot.', rug: 'Conceptually weak, but the execution was clean.', floor: 'Price is not a curatorial category.', quips: ['I would hang that lower.', 'Interesting. I do not mean it.'] },
  { bio: 'Chat says hi. Chat says a lot of things.', gm: 'GM CHAT. We have a guest.', rug: 'Clip it. Clip that immediately.', floor: 'Chat is spamming green candles, so that is my research.', quips: ['Hold on, somebody just donated.', 'Say that again for the people in the back of the stream.'] },
  { bio: 'I have been early to everything, including the exits.', gm: 'gm. We are so back.', rug: 'Twice this week. It builds character.', floor: 'Floor is a suggestion. Not advice. Nothing is advice.', quips: ['Is this an airdrop?', 'I aped before you finished that sentence.'] },
  { bio: 'I keep the after-party alive, one drop at a time.', gm: 'gm is what I say at the end of my set.', rug: 'Nobody hears a rug over a good bassline.', floor: 'The only floor I care about is the dance one.', quips: ['Hold on, I am beatmatching this conversation.', 'You need a longer intro.'] },
  { bio: 'When I move, charts notice.', gm: 'gm. Do not tell anyone I am here.', rug: 'I felt a small draft. Was that it?', floor: 'I am the floor.', quips: ['I never sell. I rebalance, loudly.', 'One of my wallets likes you.'] },
  { bio: 'Earpiece in, smile on. You are not on the list.', gm: 'gm. Name?', rug: 'Nobody leaves with a rug on my shift.', floor: 'I only guard doors, not prices.', quips: ['Step to the left, please.', 'I saw that. I see everything.'] },
  { bio: 'I am the reason anybody is awake at this summit.', gm: 'Bom dia. Bica or bica?', rug: 'You look like you need a double, not a detective.', floor: 'Oat milk is the only asset that ever really dumps.', quips: ['That is not a latte, that is a cry for help.', 'I wrote your name wrong on purpose.'] },
  { bio: 'One more run. I said that six hours ago.', gm: 'gm. GG in advance.', rug: 'Skill issue, honestly.', floor: 'Is the floor a boss? Can I speedrun it?', quips: ['Press F for that one.', 'I would have dodged that.'] },
  { bio: 'Whatever you say next will be a template.', gm: 'gm. Nice face. Mind if I crop it?', rug: 'Top text: rug. Bottom text: pulled.', floor: 'Floor price is funnier if you say it slowly.', quips: ['Nobody: ... Me: this.', 'I have already posted this conversation.'] },
  { bio: 'I got the shot. And the backup. And you, blinking.', gm: 'gm. Do not move. Perfect. You moved.', rug: 'It is on film, third frame from the left.', floor: 'Everything looks better at golden hour, even that chart.', quips: ['Chin down. No, the other down.', 'Delete it? It is already on film.'] },
  { bio: 'I kickflip over the calçada, sometimes on purpose.', gm: 'gm. Have you seen my board?', rug: 'I land on rugs all the time. Good grip.', floor: 'I only know the floor from up close.', quips: ['Nice ollie.', 'This town has hills. That is the whole plan.'] },
  { bio: 'Brunch? I made it. You are welcome, and you are late.', gm: 'Bom dia. Sit down, you look hungry.', rug: 'I saw who did it. They did not tip.', floor: 'Everything is cheaper than my truffle.', quips: ['Compliments to me.', 'Have a nata. That was not a question.'] },
];
const MOOD = {
  'Low Battery': 'Sorry, I am on 3%.', 'Wait What?': 'Wait, what did you ask?', 'Sweaty Palms': 'Is it hot in here or is it me?', 'Good Vibes': 'Good talk, honestly.',
  'Told You So': 'I did tell you, by the way.', Rizz: 'Anyway. You come here often?', Starstruck: 'I still cannot believe I get to be here.', 'Crying Laughing': 'I am crying. Literally.',
  'Down Bad': 'Do you think they will text back?', 'Galaxy Brain': 'It is all connected, if you think about it.', 'Unicorn Tears': 'Sorry, these are happy tears. Mostly.',
};
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* traits: { role: 0..15, roleName, expression, prop, moment, tier } with the names as the NFT shows them. */
export function personaOf(traits) {
  const R = ROLES[traits.role & 15];
  return {
    name: traits.expression + ' ' + traits.roleName,
    bio: R.bio,
    traits,
    item: traits.prop === 'None' ? 'Nothing. Empty hands, clear conscience.' : 'A ' + traits.prop + '. It came with my run, the luck of the draw.',
    moment: 'My moment is ' + traits.moment + '. It plays on loop. Forever. It is fine.',
  };
}

const MONEY = /\b(floor|pric|worth|pump|dump|sell|sold|buy|bought|invest|financ|profit|roi\b|cost|flip|prezz|compr|vend|guadagn)/;
export const isMoneyQuestion = (message) => MONEY.test(String(message || '').normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff]/g, '').toLowerCase());

/* What the avatar answers. Never investment advice, whatever its role says about the floor. */
export function reply(persona, message) {
  const R = ROLES[persona.traits.role & 15];
  const text = String(message || '').toLowerCase().slice(0, 280);
  const pick = (list) => list[hash(text + persona.name) % list.length];
  let out;
  if (/\b(gm|hi|hello|hey|hiya|ciao|salve|bom dia|buongiorno)\b/.test(text)) out = R.gm;
  else if (/\b(rug|rugs|rugged|scam|culprit|who did|colpevole)\b/.test(text)) out = R.rug;
  else if (MONEY.test(text)) out = R.floor + ' Not financial advice, I am a pixel.';
  else if (/\b(wallet|agent|agents|agente|8004|6551|identity|autonomous|onchain|on-chain)\b/.test(text)) out = 'I am built to have my own on-chain identity and my own wallet once minted. For now I talk, and I run the Daily for you.';
  else if (/\b(item|hold|holding|carry|carrying|hand|hands)\b/.test(text)) out = persona.item;
  else if (/\b(moment|famous|best|loop)\b/.test(text)) out = persona.moment;
  else if (/\b(play|game|run|daily|score|level|gioca|gioco)\b/.test(text)) out = 'Send me on today\'s run. I bump fewer people than you do.';
  else if (/\b(who are you|your name|what are you|about you|chi sei|ti chiami)\b/.test(text)) out = 'I am ' + persona.name + '. ' + R.bio;
  else out = pick(R.quips);
  if (hash(text) % 3 === 0) out += ' ' + (MOOD[persona.traits.expression] || '');
  return out.trim();
}
