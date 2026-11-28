/**
 * Lines to read while the AI works: true little facts, jokes, and the occasional joke about the wait itself.
 * Each set matches its job. Every fact here is checkable.
 */
export type QuipSet = "research" | "model3d" | "study" | "scan" | "audio" | "slides" | "link" | "split" | "map";

export const QUIPS: Record<QuipSet, string[]> = {
  research: [
    "Fun fact: the first YouTube video, “Me at the zoo”, is 19 seconds long and is mostly about elephants' trunks.",
    "I'm an AI looking things up so you have fewer tabs open. Closing them is still your job.",
    "Hermann Ebbinghaus charted the forgetting curve in 1885, using only himself as the test subject.",
    "Octopuses have three hearts. I looked it up. Twice.",
    "Checking that every video really exists. I don't trust a link I haven't met.",
    "A day on Venus is longer than its year. Venus is not a morning planet.",
    "Bananas are berries. Strawberries are not. Botany is a prank.",
    "Meta joke: this loading line has had more rewrites than your essay.",
    "Reading Wikipedia fast. Humans manage about 240 words a minute. I'm trying not to gloat.",
    "Studying with spaced repetition beats cramming. Your future self says thanks in advance.",
    "The Eiffel Tower is up to 15 cm taller in summer, because iron expands in the heat.",
    "Somewhere a video is being politely asked whether it's real. It's nervous.",
  ],
  model3d: [
    "Meta joke: I'm an AI imagining a cell, then giving it coordinates. Cells have never needed coordinates.",
    "Fun fact: the word “cell” was coined by Robert Hooke in 1665, after he looked at cork.",
    "A cube has 8 corners, 12 edges and 6 faces. I count them every time, just in case.",
    "The famous Utah teapot, a 3D graphics test object, dates from 1975.",
    "Reference picture first, 3D second. Even AI sketches before it builds.",
    "Making the shells see-through so you can see the insides. Rude, but educational.",
    "Leonardo da Vinci drew machines taken apart in the 1400s. This is that, with fewer horses.",
    "The hairy ball theorem says you can't comb a hairy ball flat. Mathematicians have standards.",
    "Spacing the parts out so nothing overlaps. Personal space is a feature.",
    "Pixar's first animated short, “Luxo Jr.”, was a desk lamp, in 1986. Everyone starts somewhere.",
    "Quality over speed: I'm doing it properly, which means slowly, which means you get a joke.",
    "Placing parts with numbers and hoping gravity isn't a rule. Gravity has been told it's optional.",
  ],
  study: [
    "Testing yourself beats rereading. It's called retrieval practice, and it's one of the best-studied tricks around.",
    "A flashcard walks into a bar. It's tired of being flipped.",
    "Sleep helps memories settle. Naps count. This is professional advice.",
    "I'm writing questions only from your notes. No surprise questions about swallows.",
    "Meta joke: the AI is quizzing you, which is fair after you made it work this hard.",
    "Spacing reviews over days beats one long session. Procrastinators hate this one trick.",
    "Making sure every answer can be found in what you wrote. I do not freestyle.",
    "Mistakes help you learn when you get quick feedback. So be kind to your wrong answers.",
  ],
  scan: [
    "Reading your handwriting. I've seen worse. I think.",
    "About 1 in 10 people are left-handed. Smudged ink is their villain origin story.",
    "Anything I can't read is marked [illegible] instead of guessed. Honesty is a feature.",
    "Meta joke: an AI is squinting at your handwriting. It has no eyes. It's doing its best.",
    "Straightening pages and counting lines. Ruled paper is a love letter to OCR.",
    "The word “manuscript” literally means “written by hand”.",
  ],
  audio: [
    "People speak at roughly 150 words a minute. I'm listening faster. Please don't talk faster.",
    "I won't judge your ums and uhs. Much.",
    "Marking each line with its time, so you can tap it and jump back.",
    "Meta joke: I'm an AI taking notes on a lecture so you can pay attention to the next one.",
    "Humans can tell speakers apart in a fraction of a second. I'm working on it.",
  ],
  slides: [
    "PowerPoint 1.0 shipped in 1987. Bullet points have been unstoppable since.",
    "Death by bullet points is not a real cause of death. Yet.",
    "Turning each slide into notes you can search, link and quiz yourself on.",
    "Meta joke: an AI reading slides so you don't have to sit through the transitions.",
    "Slides are usually a summary of a talk. I'm summarising the summary. Please don't tell the speaker.",
  ],
  link: [
    "The first website is still online at info.cern.ch. It's about the web itself.",
    "Reading the page like a person would, minus the cookie banners.",
    "Meta joke: I'm reading a link so you can skip the tab that you were going to forget about.",
    "A hyperlink is just a very short promise that something exists.",
    "Dividing it into one note per idea, so no idea has to share.",
  ],
  split: [
    "Scissors are over 3,000 years old. This is the same idea, in software.",
    "One idea per note makes things easier to link and easier to remember.",
    "Meta joke: I'm splitting up your note. It's not me, it's the structure.",
    "Finding the natural seams in your writing. They're there. They always are.",
  ],
  map: [
    "Mind maps put the big idea in the middle and let the rest branch out, like a tree that took notes.",
    "Meta joke: I'm drawing connections between your ideas. It's what a group chat does, but with sources.",
    "Concept maps were developed by Joseph Novak in the 1970s to track how students understand science.",
    "Arranging nodes so no two labels collide. It's a lot like seating a wedding.",
  ],
};

/** A shuffled copy (Fisher–Yates), so each wait reads in a different order. */
export function shuffled<T>(list: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}
