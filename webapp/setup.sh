#!/bin/bash

# MLB Round Robin Web App - Quick Setup Script
# This script sets up the entire application stack

set -e  # Exit on error

echo "🚀 MLB Round Robin Web App - Setup Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install npm first.${NC}"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL client not found. Database setup will be skipped.${NC}"
    SKIP_DB=true
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Setup Backend
echo "🔧 Setting up Backend..."
cd backend

if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from example..."
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit backend/.env with your API keys and database credentials${NC}"
fi

echo "📦 Installing backend dependencies..."
npm install

echo -e "${GREEN}✅ Backend setup complete${NC}"
echo ""

# Setup Database
if [ "$SKIP_DB" != true ]; then
    echo "🗄️  Setting up Database..."
    cd ../database
    
    # Check if database exists
    if psql -lqt | cut -d \| -f 1 | grep -qw mlb_rr_model; then
        echo -e "${YELLOW}⚠️  Database 'mlb_rr_model' already exists. Skipping creation.${NC}"
    else
        echo "📝 Creating database..."
        createdb mlb_rr_model || echo -e "${YELLOW}⚠️  Failed to create database. You may need to do this manually.${NC}"
    fi
    
    echo "📝 Running database migrations..."
    psql mlb_rr_model < schema.sql || echo -e "${YELLOW}⚠️  Failed to run migrations. Please check database connection.${NC}"
    
    echo -e "${GREEN}✅ Database setup complete${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  Skipping database setup. Please install PostgreSQL and run manually.${NC}"
    echo ""
fi

# Setup Frontend
echo "🎨 Setting up Frontend..."
cd ../frontend

if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    echo "REACT_APP_API_URL=http://localhost:5000/api" > .env
    echo "REACT_APP_ENV=development" >> .env
fi

echo "📦 Installing frontend dependencies..."
npm install

echo -e "${GREEN}✅ Frontend setup complete${NC}"
echo ""

# Final instructions
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Configure your API keys in backend/.env:"
echo "   - ODDS_API_KEY (get from https://the-odds-api.com)"
echo "   - DATABASE_URL (if different from defaults)"
echo ""
echo "2. Start the backend server:"
echo "   cd backend && npm run dev"
echo ""
echo "3. In a new terminal, start the frontend:"
echo "   cd frontend && npm start"
echo ""
echo "4. Open your browser to:"
echo "   http://localhost:3000"
echo ""
echo "5. (Optional) Load historical data:"
echo "   cd backend && npm run seed"
echo ""
echo -e "${GREEN}🚀 You're ready to go!${NC}"
echo ""
echo "📚 See README.md for more information"
echo ""
