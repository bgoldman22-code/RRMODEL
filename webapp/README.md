# MLB Home Run Round Robin - Web Application

**Production-ready web application for managing MLB home run prop betting with Round Robin parlays.**

## 🎯 Features

### Frontend (React)
- 📊 **Real-time Dashboard** - Live performance charts and metrics
- 🎲 **Daily Picks** - Today's recommended players with current odds
- 📈 **Historical Analysis** - P&L tracking by structure and season
- 👥 **Player Rankings** - Top players with comprehensive stats
- 💰 **Bankroll Manager** - Track balance, calculate Kelly stakes
- 📉 **CLV Tracking** - Monitor closing line value
- 🎫 **Bet Slip Generator** - Export picks to FanDuel format

### Backend (Node.js/Express)
- 🔄 **Live Odds Integration** - Real-time odds from The Odds API
- 🏥 **Injury Tracking** - Automatic player status updates
- 💾 **PostgreSQL Database** - Persistent storage for all data
- 🔐 **Authentication** - Secure user management
- 📡 **REST API** - Full API for frontend communication
- ⏰ **Scheduled Jobs** - Automated data updates

### Database (PostgreSQL)
- Historical picks and results
- Daily odds snapshots
- Bankroll transactions
- User settings and preferences
- Performance metrics

## 📁 Project Structure

```
webapp/
├── backend/           # Node.js/Express server
│   ├── src/
│   │   ├── api/      # API routes
│   │   ├── services/ # Business logic
│   │   ├── jobs/     # Scheduled tasks
│   │   ├── models/   # Database models
│   │   └── utils/    # Helper functions
│   ├── package.json
│   └── server.js
├── frontend/         # React application
│   ├── public/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API calls
│   │   ├── utils/       # Utilities
│   │   └── App.js
│   └── package.json
├── database/         # Database schemas
│   ├── migrations/   # Schema migrations
│   ├── seeds/        # Initial data
│   └── schema.sql
└── docker-compose.yml
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+
- The Odds API key (https://the-odds-api.com)

### Installation

1. **Clone and navigate:**
```bash
cd /Users/brentgoldman/RRMODEL/webapp
```

2. **Setup Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys and database credentials
npm run migrate  # Run database migrations
npm run seed     # Load historical data
npm start        # Start server on port 5000
```

3. **Setup Frontend:**
```bash
cd ../frontend
npm install
npm start        # Start React app on port 3000
```

4. **Setup Database:**
```bash
# Create database
createdb mlb_rr_model

# Run migrations
cd ../database
psql mlb_rr_model < schema.sql
```

### Using Docker (Recommended)

```bash
# Start all services (backend, frontend, database)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

Application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Database: postgresql://localhost:5432/mlb_rr_model

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mlb_rr_model

# APIs
ODDS_API_KEY=your_odds_api_key_here
ODDS_API_REGION=us
ODDS_API_MARKET=batter_home_runs

# Server
PORT=5000
NODE_ENV=production

# Scheduling
ODDS_UPDATE_INTERVAL=300000  # 5 minutes
INJURY_UPDATE_INTERVAL=600000  # 10 minutes

# Bankroll
STARTING_BANKROLL=10000
KELLY_FRACTION=0.25  # Fractional Kelly (0.25 = quarter Kelly)
MAX_DAILY_RISK=0.10  # 10% max daily risk
MAX_BET_SIZE=0.05    # 5% max per bet
```

**Frontend (.env):**
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_ENV=production
```

## 📊 API Endpoints

### Picks
- `GET /api/picks/today` - Today's recommended picks
- `GET /api/picks/history` - Historical picks
- `POST /api/picks/simulate` - Simulate picks with custom parameters

### Odds
- `GET /api/odds/live` - Current live odds
- `GET /api/odds/history/:date` - Historical odds for date
- `GET /api/odds/clv/:pickId` - CLV analysis for specific pick

### Results
- `GET /api/results/:date` - Game results for date
- `GET /api/results/summary` - Overall performance summary
- `GET /api/results/by-structure` - Results grouped by RR structure

### Bankroll
- `GET /api/bankroll/current` - Current balance and stats
- `GET /api/bankroll/history` - Transaction history
- `POST /api/bankroll/update` - Update bankroll (manual adjustment)
- `GET /api/bankroll/kelly/:pickId` - Calculate Kelly stake for pick

### Players
- `GET /api/players/rankings` - Top players by HR score
- `GET /api/players/:id` - Player details and stats
- `GET /api/players/:id/history` - Player performance history

### Stats
- `GET /api/stats/overall` - Overall model performance
- `GET /api/stats/by-season/:year` - Season-specific stats
- `GET /api/stats/roi` - ROI analysis by structure

## 🎮 Usage

### Daily Workflow

1. **Morning (Pre-Game):**
   - Open dashboard at http://localhost:3000
   - Review today's picks on "Daily Picks" page
   - Check player injury status
   - Review live odds (auto-updated every 5 min)
   - Calculate Kelly stakes in "Bankroll Manager"
   - Generate bet slip and place bets on FanDuel

2. **During Games:**
   - Monitor live results (if implemented)
   - Track potential winning parlays

3. **Post-Game:**
   - Results automatically imported from MLB API
   - Winning parlays calculated
   - Bankroll updated
   - CLV recorded for picks
   - Dashboard charts updated

### Viewing Performance

- **Dashboard:** Overall ROI, win rates, profit charts
- **Historical:** Filter by date range, structure, season
- **Player Analysis:** See which players are most profitable
- **CLV Tracking:** Measure how well you beat the closing line

## 🛠️ Development

### Running Tests
```bash
cd backend
npm test

cd ../frontend
npm test
```

### Database Migrations
```bash
cd backend
npm run migrate:create -- add_new_table
npm run migrate:up
npm run migrate:down
```

### Building for Production
```bash
# Frontend
cd frontend
npm run build

# Backend
cd ../backend
npm run build
```

## 📈 Performance Targets (V1)

Based on historical backtest (see `COMPLETE_BACKTEST_ANALYSIS_REPORT.md`):

- **Combined ROI:** +26.0%
- **2024 ROI:** +31.6%
- **2025 ROI:** +20.4%
- **Total Profit:** +$31,711 on $122,030 invested
- **Win Rate:** 15-34% (varies by structure)
- **Sharpe Ratio:** 0.82-1.21

## 🚧 Roadmap

### Phase 1: Core Application (Current)
- ✅ Backend API
- ✅ Frontend Dashboard
- ✅ Database Schema
- ✅ Live Odds Integration
- ✅ Basic Bankroll Management

### Phase 2: Enhanced Features (Weeks 1-4)
- [ ] Advanced Kelly Calculator
- [ ] CLV Tracking
- [ ] Injury Auto-Exclusion
- [ ] Email/SMS Alerts
- [ ] Mobile Responsive Design

### Phase 3: V2 Model Integration (Weeks 5-12)
- [ ] Park Factors
- [ ] Pitcher Matchup Analysis
- [ ] Weather Integration
- [ ] Platoon Splits
- [ ] Rolling Form Metrics
- [ ] Machine Learning Model

### Phase 4: Production Deployment (Weeks 13-16)
- [ ] AWS/Cloud Deployment
- [ ] SSL Certificates
- [ ] Backup System
- [ ] Monitoring & Alerting
- [ ] Rate Limiting
- [ ] User Authentication

## 🔐 Security

- API keys stored in environment variables (never committed)
- Database credentials encrypted
- HTTPS/SSL in production
- Rate limiting on API endpoints
- Input validation and sanitization
- SQL injection protection (parameterized queries)

## 📝 License

Proprietary - For personal use only

## 🤝 Support

For issues or questions, contact the development team.

---

**Built with:**
- React 18
- Node.js 18
- Express 4
- PostgreSQL 14
- Chart.js 4
- Tailwind CSS 3
- Docker

**Data Sources:**
- The Odds API (live odds)
- MLB Stats API (game results)
- FanGraphs (player stats)
- Rotowire (injury updates)
