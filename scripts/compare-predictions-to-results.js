#!/usr/bin/env node
/**
 * Compare Model Predictions to Actual 2024 NFL Results
 * 
 * Analyzes accuracy of predictions against real game outcomes
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PredictionValidator {
  constructor() {
    this.predictionsFile = path.join(__dirname, '..', 'backtest-results', 'nfl-2024-model-predictions.csv');
    this.outputDir = path.join(__dirname, '..', 'backtest-results');
  }

  /**
   * Parse actual NFL 2024 results
   */
  parseActualResults(csvData) {
    console.log('📊 Parsing actual 2024 NFL results...');
    
    const lines = csvData.trim().split('\n');
    const results = new Map(); // Key: "week_homeTeam_awayTeam"
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.startsWith('Week\t')) continue;
      
      const parts = line.split('\t');
      if (parts.length < 10) continue;
      
      const week = parts[0];
      const winner = parts[4];
      const loser = parts[6];
      const ptsW = parseInt(parts[8]);
      const ptsL = parseInt(parts[9]);
      
      if (!winner || !loser || isNaN(ptsW) || isNaN(ptsL)) continue;
      
      // Determine home/away
      let homeTeam, awayTeam, homeScore, awayScore;
      
      if (winner.includes('@')) {
        awayTeam = this.mapTeamName(winner.replace('@', '').trim());
        homeTeam = this.mapTeamName(loser.trim());
        awayScore = ptsW;
        homeScore = ptsL;
      } else if (loser.includes('@')) {
        homeTeam = this.mapTeamName(winner.trim());
        awayTeam = this.mapTeamName(loser.replace('@', '').trim());
        homeScore = ptsW;
        awayScore = ptsL;
      } else {
        homeTeam = this.mapTeamName(winner.trim());
        awayTeam = this.mapTeamName(loser.trim());
        homeScore = ptsW;
        awayScore = ptsL;
      }
      
      if (!homeTeam || !awayTeam) continue;
      
      const weekNum = this.parseWeek(week);
      const key = `${weekNum}_${homeTeam}_${awayTeam}`;
      
      results.set(key, {
        week: weekNum,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        winner: homeScore > awayScore ? homeTeam : awayTeam,
        actualScore: `${homeScore}-${awayScore}`
      });
    }
    
    console.log(`✅ Parsed ${results.size} actual game results`);
    return results;
  }

  parseWeek(weekStr) {
    if (weekStr === 'WildCard') return 19;
    if (weekStr === 'Division') return 20;
    if (weekStr === 'ConfChamp') return 21;
    if (weekStr === 'SuperBowl') return 22;
    return parseInt(weekStr) || 0;
  }

  mapTeamName(fullName) {
    const teamMap = {
      'Kansas City Chiefs': 'KC', 'Buffalo Bills': 'BUF', 'Baltimore Ravens': 'BAL',
      'San Francisco 49ers': 'SF', 'Detroit Lions': 'DET', 'Philadelphia Eagles': 'PHI',
      'Dallas Cowboys': 'DAL', 'Green Bay Packers': 'GB', 'Miami Dolphins': 'MIA',
      'Cincinnati Bengals': 'CIN', 'Jacksonville Jaguars': 'JAX', 'Houston Texans': 'HOU',
      'Los Angeles Chargers': 'LAC', 'Pittsburgh Steelers': 'PIT', 'Indianapolis Colts': 'IND',
      'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB', 'Minnesota Vikings': 'MIN',
      'Atlanta Falcons': 'ATL', 'New Orleans Saints': 'NO', 'Los Angeles Rams': 'LAR',
      'Cleveland Browns': 'CLE', 'Las Vegas Raiders': 'LV', 'New York Jets': 'NYJ',
      'Tennessee Titans': 'TEN', 'Chicago Bears': 'CHI', 'Washington Commanders': 'WAS',
      'Arizona Cardinals': 'ARI', 'New York Giants': 'NYG', 'Carolina Panthers': 'CAR',
      'New England Patriots': 'NE', 'Denver Broncos': 'DEN'
    };
    return teamMap[fullName] || fullName;
  }

  /**
   * Load predictions from CSV
   */
  async loadPredictions() {
    console.log('📂 Loading model predictions...');
    const data = await fs.readFile(this.predictionsFile, 'utf8');
    const lines = data.trim().split('\n');
    const predictions = [];
    
    for (let i = 1; i < lines.length; i++) { // Skip header
      const parts = lines[i].split(',');
      if (parts.length < 11) continue;
      
      predictions.push({
        week: parseInt(parts[0]),
        date: parts[1],
        homeTeam: parts[2],
        awayTeam: parts[3],
        predictedWinner: parts[4],
        confidence: parseInt(parts[5]),
        edge: parseFloat(parts[6]),
        betRecommendation: parts[7],
        actualWinner: parts[8] || null,
        actualScore: parts[9] || null,
        correct: parts[10] || null
      });
    }
    
    console.log(`✅ Loaded ${predictions.length} predictions`);
    return predictions;
  }

  /**
   * Match predictions with actual results and analyze
   */
  async validatePredictions(predictions, actualResults) {
    console.log('\n🔍 Matching predictions with actual results...\n');
    
    let matched = 0;
    let correct = 0;
    let incorrect = 0;
    let unmatched = 0;
    
    const updatedPredictions = [];
    const byWeek = {};
    const byConfidence = { high: { total: 0, correct: 0 }, medium: { total: 0, correct: 0 }, low: { total: 0, correct: 0 } };
    const bettingPerformance = { totalBets: 0, won: 0, lost: 0 };
    
    for (const pred of predictions) {
      const key = `${pred.week}_${pred.homeTeam}_${pred.awayTeam}`;
      const actual = actualResults.get(key);
      
      if (actual) {
        matched++;
        const isCorrect = pred.predictedWinner === actual.winner;
        
        const updatedPred = {
          ...pred,
          actualWinner: actual.winner,
          actualScore: actual.actualScore,
          correct: isCorrect
        };
        
        updatedPredictions.push(updatedPred);
        
        if (isCorrect) {
          correct++;
        } else {
          incorrect++;
        }
        
        // By week
        if (!byWeek[pred.week]) {
          byWeek[pred.week] = { total: 0, correct: 0, incorrect: 0 };
        }
        byWeek[pred.week].total++;
        if (isCorrect) {
          byWeek[pred.week].correct++;
        } else {
          byWeek[pred.week].incorrect++;
        }
        
        // By confidence
        let confBucket;
        if (pred.confidence >= 70) confBucket = 'high';
        else if (pred.confidence >= 55) confBucket = 'medium';
        else confBucket = 'low';
        
        byConfidence[confBucket].total++;
        if (isCorrect) byConfidence[confBucket].correct++;
        
        // Betting performance
        if (pred.betRecommendation === 'BET') {
          bettingPerformance.totalBets++;
          if (isCorrect) {
            bettingPerformance.won++;
          } else {
            bettingPerformance.lost++;
          }
        }
      } else {
        unmatched++;
        updatedPredictions.push(pred);
      }
    }
    
    // Calculate metrics
    const accuracy = matched > 0 ? ((correct / matched) * 100).toFixed(1) : '0.0';
    const bettingROI = bettingPerformance.totalBets > 0 
      ? (((bettingPerformance.won * 0.91 - bettingPerformance.lost) / bettingPerformance.totalBets) * 100).toFixed(2)
      : '0.00';
    
    // Display results
    console.log('═'.repeat(80));
    console.log('📊 PREDICTION VALIDATION RESULTS');
    console.log('═'.repeat(80));
    console.log(`\n✅ Matched Games: ${matched}`);
    console.log(`   Correct Predictions: ${correct}`);
    console.log(`   Incorrect Predictions: ${incorrect}`);
    console.log(`   Overall Accuracy: ${accuracy}%`);
    console.log(`   Unmatched: ${unmatched}`);
    
    console.log(`\n📈 ACCURACY BY WEEK:`);
    const sortedWeeks = Object.keys(byWeek).sort((a, b) => parseInt(a) - parseInt(b));
    for (const week of sortedWeeks) {
      const data = byWeek[week];
      const weekAcc = ((data.correct / data.total) * 100).toFixed(1);
      const weekLabel = week <= 18 ? `Week ${week}` : 
                        week === 19 ? 'Wild Card' :
                        week === 20 ? 'Divisional' :
                        week === 21 ? 'Conf Champ' : 'Super Bowl';
      console.log(`   ${weekLabel}: ${weekAcc}% (${data.correct}-${data.incorrect})`);
    }
    
    console.log(`\n🎯 ACCURACY BY CONFIDENCE:`);
    console.log(`   High (70%+): ${byConfidence.high.total > 0 ? ((byConfidence.high.correct / byConfidence.high.total) * 100).toFixed(1) : '0.0'}% (${byConfidence.high.correct}/${byConfidence.high.total})`);
    console.log(`   Medium (55-70%): ${byConfidence.medium.total > 0 ? ((byConfidence.medium.correct / byConfidence.medium.total) * 100).toFixed(1) : '0.0'}% (${byConfidence.medium.correct}/${byConfidence.medium.total})`);
    console.log(`   Low (<55%): ${byConfidence.low.total > 0 ? ((byConfidence.low.correct / byConfidence.low.total) * 100).toFixed(1) : '0.0'}% (${byConfidence.low.correct}/${byConfidence.low.total})`);
    
    console.log(`\n💰 BETTING PERFORMANCE (BET recommendations only):`);
    console.log(`   Total Bets: ${bettingPerformance.totalBets}`);
    console.log(`   Won: ${bettingPerformance.won}`);
    console.log(`   Lost: ${bettingPerformance.lost}`);
    console.log(`   Record: ${bettingPerformance.won}-${bettingPerformance.lost}`);
    console.log(`   ROI (assuming -110 odds): ${bettingROI}%`);
    
    console.log('\n' + '═'.repeat(80));
    
    // Save updated predictions
    await this.saveUpdatedPredictions(updatedPredictions);
    
    // Save summary report
    await this.saveSummaryReport({
      matched,
      correct,
      incorrect,
      accuracy,
      byWeek,
      byConfidence,
      bettingPerformance,
      bettingROI
    });
    
    return { matched, correct, incorrect, accuracy };
  }

  /**
   * Save updated predictions with actual results
   */
  async saveUpdatedPredictions(predictions) {
    const csvHeader = ['week', 'date', 'homeTeam', 'awayTeam', 'predictedWinner', 'confidence', 'edge', 'betRecommendation', 'actualWinner', 'actualScore', 'correct'];
    const rows = [csvHeader.join(',')];
    
    for (const pred of predictions) {
      rows.push([
        pred.week,
        pred.date || '',
        pred.homeTeam,
        pred.awayTeam,
        pred.predictedWinner,
        pred.confidence,
        pred.edge,
        pred.betRecommendation,
        pred.actualWinner || '',
        pred.actualScore || '',
        pred.correct !== null ? pred.correct : ''
      ].join(','));
    }
    
    const outPath = path.join(this.outputDir, 'nfl-2024-predictions-validated.csv');
    await fs.writeFile(outPath, rows.join('\n'), 'utf8');
    console.log(`\n✅ Updated predictions saved to: ${outPath}`);
  }

  /**
   * Save summary report
   */
  async saveSummaryReport(report) {
    const timestamp = new Date().toISOString();
    const outPath = path.join(this.outputDir, 'validation-report.json');
    
    await fs.writeFile(outPath, JSON.stringify({
      timestamp,
      ...report
    }, null, 2), 'utf8');
    
    console.log(`✅ Validation report saved to: ${outPath}`);
  }

  async run() {
    console.log('🏈 NFL 2024 Prediction Validation Starting...\n');
    
    // Actual results from user
    const actualResultsCSV = `Week	Day	Date	Time	Winner/tie		Loser/tie		PtsW	PtsL	YdsW	TOW	YdsL	TOL
1	Thu	2024-09-05	8:20PM	Kansas City Chiefs		Baltimore Ravens	boxscore	27	20	353	1	452	1
1	Fri	2024-09-06	8:15PM	Philadelphia Eagles		Green Bay Packers	boxscore	34	29	410	3	414	1
1	Sun	2024-09-08	1:00PM	Pittsburgh Steelers	@	Atlanta Falcons	boxscore	18	10	270	0	226	3
1	Sun	2024-09-08	1:00PM	Buffalo Bills		Arizona Cardinals	boxscore	34	28	352	1	270	1
1	Sun	2024-09-08	1:00PM	New Orleans Saints		Carolina Panthers	boxscore	47	10	379	1	193	3
1	Sun	2024-09-08	1:00PM	Chicago Bears		Tennessee Titans	boxscore	24	17	148	1	244	3
1	Sun	2024-09-08	1:00PM	New England Patriots	@	Cincinnati Bengals	boxscore	16	10	290	0	224	2
1	Sun	2024-09-08	1:00PM	Houston Texans	@	Indianapolis Colts	boxscore	29	27	417	0	303	1
1	Sun	2024-09-08	1:00PM	Miami Dolphins		Jacksonville Jaguars	boxscore	20	17	400	0	267	1
1	Sun	2024-09-08	1:00PM	Minnesota Vikings	@	New York Giants	boxscore	28	6	312	2	240	2
1	Sun	2024-09-08	4:05PM	Seattle Seahawks		Denver Broncos	boxscore	26	20	304	2	231	3
1	Sun	2024-09-08	4:05PM	Los Angeles Chargers		Las Vegas Raiders	boxscore	22	10	316	0	296	3
1	Sun	2024-09-08	4:25PM	Dallas Cowboys	@	Cleveland Browns	boxscore	33	17	265	0	230	2
1	Sun	2024-09-08	4:25PM	Tampa Bay Buccaneers		Washington Commanders	boxscore	37	20	392	0	299	0
1	Sun	2024-09-08	8:20PM	Detroit Lions		Los Angeles Rams	boxscore	26	20	363	1	387	1
1	Mon	2024-09-09	8:15PM	San Francisco 49ers		New York Jets	boxscore	32	19	401	0	266	2`;
    
    // Parse actual results
    const actualResults = this.parseActualResults(actualResultsCSV + `
2	Thu	2024-09-12	8:15PM	Buffalo Bills	@	Miami Dolphins	boxscore	31	10	247	0	351	3
2	Sun	2024-09-15	1:00PM	Los Angeles Chargers	@	Carolina Panthers	boxscore	26	3	349	2	159	1
2	Sun	2024-09-15	1:00PM	Cleveland Browns	@	Jacksonville Jaguars	boxscore	18	13	297	0	323	0
2	Sun	2024-09-15	1:00PM	Green Bay Packers		Indianapolis Colts	boxscore	16	10	383	1	338	3
2	Sun	2024-09-15	1:00PM	New Orleans Saints	@	Dallas Cowboys	boxscore	44	19	432	1	353	2
2	Sun	2024-09-15	1:00PM	Tampa Bay Buccaneers	@	Detroit Lions	boxscore	20	16	216	1	463	2
2	Sun	2024-09-15	1:00PM	Minnesota Vikings		San Francisco 49ers	boxscore	23	17	403	2	396	2
2	Sun	2024-09-15	1:00PM	Seattle Seahawks	@	New England Patriots	boxscore	23	20	358	0	310	0
2	Sun	2024-09-15	1:00PM	Washington Commanders		New York Giants	boxscore	21	18	425	0	304	1
2	Sun	2024-09-15	1:00PM	New York Jets	@	Tennessee Titans	boxscore	24	17	265	0	300	2
2	Sun	2024-09-15	1:00PM	Las Vegas Raiders	@	Baltimore Ravens	boxscore	26	23	260	1	383	1
2	Sun	2024-09-15	4:05PM	Arizona Cardinals		Los Angeles Rams	boxscore	41	10	489	1	245	1
2	Sun	2024-09-15	4:25PM	Kansas City Chiefs		Cincinnati Bengals	boxscore	26	25	286	3	320	1
2	Sun	2024-09-15	4:25PM	Pittsburgh Steelers	@	Denver Broncos	boxscore	13	6	251	0	295	2
2	Sun	2024-09-15	8:20PM	Houston Texans		Chicago Bears	boxscore	19	13	310	1	205	2
2	Mon	2024-09-16	8:15PM	Atlanta Falcons	@	Philadelphia Eagles	boxscore	22	21	385	0	365	1`);
    
    // Load predictions
    const predictions = await this.loadPredictions();
    
    // Validate
    await this.validatePredictions(predictions, actualResults);
    
    console.log('\n✅ Validation complete!\n');
  }
}

// Run validation
const validator = new PredictionValidator();
validator.run().catch(console.error);
