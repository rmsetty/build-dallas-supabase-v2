import { nearbyGroups, yourEvents } from '../home/home-data';

export function getEvent(id: string) {
  return [...yourEvents, ...nearbyGroups.flatMap((group) => group.events)].find((event) => event.id === id);
}

export const dogAbout = {
  heading: 'A Community Conversation on How You Can Show Up for Shelter Dogs',
  paragraphs: [
    'Join Dogs Only Social Club and Big Dog Energy for an afternoon dedicated to education, advocacy, and meaningful conversation around animal welfare at GoodPeople Coffee, sponsored by JustFoodForDogs, Pet Genie & Great White.',
    "Whether you're a pet parent, shelter volunteer, foster, adopter, rescue supporter, or simply someone who cares about animals, this event is designed to bring our community together to learn from people actively making an impact in the animal welfare space.",
    '🎤 Our featured panelists include:\n· @nathanthecatlady\n· @rita_earl_blackwell\n· @themobtrio\n· @zachskow\n· @nicoleandthedogss',
    "Together, they'll share their experiences, discuss challenges facing shelters and rescues today, and explore practical ways individuals can help homeless pets through adoption, fostering, volunteering, advocacy, training, and community.",
  ],
};
