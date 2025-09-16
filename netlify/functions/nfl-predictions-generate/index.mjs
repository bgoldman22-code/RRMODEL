// netlify/functions/nfl-predictions-generate/index.mjs
import { nflBlobsGetJSON as nflGetJSON, nflBlobsPutJSON as nflSetJSON } from '../_lib/blobs-nfl.js';
import { getWeekSchedule } from '../_lib/schedule-source.mjs';

// ... rest of your nfl-predictions-generate code unchanged ...
