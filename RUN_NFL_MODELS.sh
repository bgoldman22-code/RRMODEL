#!/bin/bash
# Quick launcher for NFL prediction models

echo "🏈 NFL Prediction Models - Quick Launcher"
echo "========================================"
echo ""
echo "Choose an option:"
echo ""
echo "1) Compare V1 vs V5 (recommended)"
echo "2) Run V1 only"
echo "3) Run V5 only"
echo "4) Custom week"
echo ""
read -p "Enter choice (1-4): " choice

WEEK=14
SEASON=2025

case $choice in
  1)
    echo ""
    echo "Running comparison for Week $WEEK..."
    node scripts/nfl/compare-models.mjs $SEASON $WEEK
    ;;
  2)
    echo ""
    echo "Running V1 for Week $WEEK..."
    node scripts/nfl/run-v1-local.mjs $SEASON $WEEK
    ;;
  3)
    echo ""
    echo "Running V5 for Week $WEEK..."
    node scripts/nfl/run-v5-local.mjs $SEASON $WEEK
    ;;
  4)
    read -p "Enter week number: " WEEK
    echo ""
    echo "Running comparison for Week $WEEK..."
    node scripts/nfl/compare-models.mjs $SEASON $WEEK
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "✅ Done!"
