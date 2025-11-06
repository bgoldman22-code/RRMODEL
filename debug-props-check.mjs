import { getCachedProps } from './netlify/functions/_lib/ff-blobs.mjs';

const props = await getCachedProps(10);
console.log('Total players with props:', Object.keys(props).length);

// Check specific players
const playersToCheck = [
  'Wan\'Dale Robinson',
  'Wandale Robinson', 
  'Rachaad White',
  'Jauan Jennings',
  'Bucky Irving',
  'Eddy Pineiro'
];

for (const name of playersToCheck) {
  const playerProps = props[name];
  if (playerProps) {
    console.log(`\n✓ Found: ${name}`);
    console.log('  Props:', JSON.stringify(playerProps.props, null, 2));
  } else {
    console.log(`\n✗ Not found: ${name}`);
    // Try fuzzy search
    const matches = Object.keys(props).filter(p => 
      p.toLowerCase().includes(name.toLowerCase().split(' ')[0]) ||
      p.toLowerCase().includes(name.toLowerCase().split(' ').pop())
    );
    if (matches.length > 0) {
      console.log('  Possible matches:', matches.slice(0, 3));
    }
  }
}
