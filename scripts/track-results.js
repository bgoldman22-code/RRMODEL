// scripts/track-results.js
// Manual system to track prediction accuracy and identify bias patterns

const fs = require('fs');
const path = require('path');

// Template for manual result entry
const RESULTS_TEMPLATE = {
  week: 3,
  games: [
    {
      matchup: "MIA @ BUF",
      prediction: {
        ml_pick: "BUF",
        ml_confidence: 61,
        spread_pick: "BUF", 
        spread_confidence: 64,
        spread_line: -8.5,
        total_pick: "over",
        total_confidence: 58,
        total_line: 44
      },
      actual_result: {
        home_score: null,  // Fill after games
        away_score: null,
        ml_result: null,   // "win" or "loss"
        spread_result: null, // "win", "loss", or "push" 
        total_result: null   // "win", "loss", or "push"
      }
    }
    // Add all 16 games...
  ]
};

function analyzeResults(weekResults) {
  const analysis = {
    overall: {
      games_analyzed: weekResults.games.length,
      ml_accuracy: 0,
      spread_accuracy: 0,
      total_accuracy: 0
    },
    bias_patterns: {
      home_bias: 0,
      favorite_bias: 0,
      over_bias: 0,
      confidence_calibration: {}
    },
    recommendations: []
  };

  let mlWins = 0, spreadWins = 0, totalWins = 0;
  let homePickCount = 0, favoritePickCount = 0, overPickCount = 0;
  let confidenceBuckets = { '50-60': [], '60-70': [], '70-80': [], '80+': [] };

  weekResults.games.forEach(game => {
    const pred = game.prediction;
    const actual = game.actual_result;

    if (!actual.ml_result) return; // Skip if results not filled

    // Accuracy tracking
    if (actual.ml_result === 'win') mlWins++;
    if (actual.spread_result === 'win') spreadWins++;  
    if (actual.total_result === 'win') totalWins++;

    // Bias tracking
    const isHomePick = pred.ml_pick === game.matchup.split(' @ ')[1];
    const isFavoritePick = pred.spread_line < 0; // Negative spread = favorite
    const isOverPick = pred.total_pick === 'over';

    if (isHomePick) homePickCount++;
    if (isFavoritePick) favoritePickCount++;
    if (isOverPick) overPickCount++;

    // Confidence calibration
    const confidence = pred.ml_confidence;
    if (confidence >= 80) confidenceBuckets['80+'].push(actual.ml_result === 'win');
    else if (confidence >= 70) confidenceBuckets['70-80'].push(actual.ml_result === 'win');
    else if (confidence >= 60) confidenceBuckets['60-70'].push(actual.ml_result === 'win');
    else confidenceBuckets['50-60'].push(actual.ml_result === 'win');
  });

  const completedGames = weekResults.games.filter(g => g.actual_result.ml_result).length;
  
  if (completedGames > 0) {
    analysis.overall.ml_accuracy = (mlWins / completedGames * 100).toFixed(1);
    analysis.overall.spread_accuracy = (spreadWins / completedGames * 100).toFixed(1);
    analysis.overall.total_accuracy = (totalWins / completedGames * 100).toFixed(1);

    analysis.bias_patterns.home_bias = (homePickCount / completedGames * 100).toFixed(1);
    analysis.bias_patterns.favorite_bias = (favoritePickCount / completedGames * 100).toFixed(1);
    analysis.bias_patterns.over_bias = (overPickCount / completedGames * 100).toFixed(1);

    // Confidence calibration analysis
    Object.keys(confidenceBuckets).forEach(bucket => {
      const results = confidenceBuckets[bucket];
      if (results.length > 0) {
        const accuracy = results.filter(r => r).length / results.length * 100;
        analysis.bias_patterns.confidence_calibration[bucket] = {
          games: results.length,
          accuracy: accuracy.toFixed(1)
        };
      }
    });

    // Generate recommendations
    if (analysis.bias_patterns.home_bias > 65) {
      analysis.recommendations.push("REDUCE home field advantage - picking home team too often");
    }
    if (analysis.bias_patterns.over_bias > 65) {
      analysis.recommendations.push("REDUCE total predictions - showing over bias");
    }
    if (analysis.overall.total_accuracy < 45) {
      analysis.recommendations.push("MAJOR totals issue - accuracy below 45%");
    }

    // Check confidence calibration
    const highConfGames = confidenceBuckets['70-80'].concat(confidenceBuckets['80+']);
    if (highConfGames.length > 0) {
      const highConfAccuracy = highConfGames.filter(r => r).length / highConfGames.length * 100;
      if (highConfAccuracy < 65) {
        analysis.recommendations.push("REDUCE confidence levels - high confidence games underperforming");
      }
    }
  }

  return analysis;
}

function generateWeekTemplate(week) {
  // Generate template for manual result entry
  console.log(`Generating results template for Week ${week}...`);
  
  const template = {
    week: week,
    date_created: new Date().toISOString(),
    instructions: [
      "1. Fill in actual_result fields after games complete",
      "2. Run 'node scripts/track-results.js analyze' to get analysis", 
      "3. Use recommendations to adjust model parameters"
    ],
    games: [
      // You would populate this with the actual week's games and predictions
    ]
  };

  const filename = `results_week_${week}.json`;
  fs.writeFileSync(filename, JSON.stringify(template, null, 2));
  console.log(`Template saved as ${filename}`);
  console.log("Fill in actual results after games, then run: node scripts/track-results.js analyze");
}

function analyzeWeekResults(week) {
  try {
    const filename = `results_week_${week}.json`;
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    
    console.log(`\n=== WEEK ${week} RESULTS ANALYSIS ===`);
    const analysis = analyzeResults(data);
    
    console.log('\nACCURACY SUMMARY:');
    console.log(`Moneyline: ${analysis.overall.ml_accuracy}%`);
    console.log(`Spreads: ${analysis.overall.spread_accuracy}%`);
    console.log(`Totals: ${analysis.overall.total_accuracy}%`);
    
    console.log('\nBIAS DETECTION:'); 
    console.log(`Home picks: ${analysis.bias_patterns.home_bias}% (target: ~50%)`);
    console.log(`Favorite picks: ${analysis.bias_patterns.favorite_bias}% (target: ~50%)`);
    console.log(`Over picks: ${analysis.bias_patterns.over_bias}% (target: ~50%)`);

    console.log('\nCONFIDENCE CALIBRATION:');
    Object.entries(analysis.bias_patterns.confidence_calibration).forEach(([bucket, data]) => {
      console.log(`${bucket}% confidence: ${data.accuracy}% accuracy (${data.games} games)`);
    });

    if (analysis.recommendations.length > 0) {
      console.log('\nRECOMMENDATIONS:');
      analysis.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }

    // Save analysis
    const analysisFilename = `analysis_week_${week}.json`;
    fs.writeFileSync(analysisFilename, JSON.stringify(analysis, null, 2));
    console.log(`\nDetailed analysis saved as ${analysisFilename}`);

  } catch (error) {
    console.error(`Error analyzing Week ${week}:`, error.message);
    console.log(`Make sure ${`results_week_${week}.json`} exists and has actual results filled in.`);
  }
}

// Command line interface
const command = process.argv[2];
const week = parseInt(process.argv[3]) || 3;

if (command === 'template') {
  generateWeekTemplate(week);
} else if (command === 'analyze') {
  analyzeWeekResults(week);
} else {
  console.log('NFL Results Tracker');
  console.log('Usage:');
  console.log('  node scripts/track-results.js template [week]  - Generate results template');
  console.log('  node scripts/track-results.js analyze [week]   - Analyze completed results');
  console.log('');
  console.log('Example workflow:');
  console.log('  1. node scripts/track-results.js template 3');
  console.log('  2. Fill in actual results in results_week_3.json after games');
  console.log('  3. node scripts/track-results.js analyze 3');
}
