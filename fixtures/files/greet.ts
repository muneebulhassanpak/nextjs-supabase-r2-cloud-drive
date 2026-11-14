// A small TypeScript file for the code preview.
interface Person {
  name: string;
  joined: Date;
}

export function greet(person: Person): string {
  const days = Math.floor((Date.now() - person.joined.getTime()) / 86_400_000);
  return `Hello, ${person.name}! You joined ${days} days ago.`;
}
