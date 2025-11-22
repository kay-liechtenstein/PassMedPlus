# Review Questions Extraction Guide

## Overview
The extension now supports extracting question counts from the Review Questions section in addition to the heatmap. This provides more accurate historical data since it includes all questions you've answered since September.

## How It Works

The review questions extraction reads the table that shows your attempted questions with:
- Date attempted
- Question title and difficulty (1-3 hammers)
- Result (✓ for correct, ✗ for incorrect)
- **Multi-part question detection** (EMQs and other multi-part questions)

### Multi-Part Question Detection

The extension now properly counts multi-part questions:
- **EMQ (Extended Matching Questions)**: Automatically counted as 3 questions
- **Questions with "(X items)"**: Counted as X questions
- **Numbered sub-questions**: Detected via patterns like "1. ... 2. ... 3. ..."

For example, if you answer one EMQ correctly, it counts as 3 correct questions in your statistics.

## Methods to Extract Data

### Method 1: Automatic Extraction (via Extension)

1. Navigate to PassMed and click on **"Review questions"** in the sidebar
2. The extension will detect the review table
3. Click the Progress Tracker button to see extracted data

### Method 2: Extract All Questions

1. Go to Review Questions page
2. The extension can automatically click "Show all questions" to load your complete history
3. This may take several seconds depending on how many questions you've answered

### Method 3: Manual Testing (Browser Console)

1. Navigate to Review Questions page
2. Open browser console (F12)
3. Copy and paste the contents of `test_review_extraction.js`
4. Run one of these commands:
   - `testExtractReviewQuestions()` - Extract currently visible questions
   - `testExtractAllQuestions()` - Load ALL questions then extract

## Data Format

The extraction provides:
- **Daily breakdown**: Questions per day with correct/incorrect counts
- **Total statistics**: Overall questions, correct count, incorrect count
- **Question details**: Title, difficulty, date for each question

## Differences from Heatmap

| Feature | Heatmap | Review Table |
|---------|---------|--------------|
| Historical Data | Limited to recent months | All questions since account creation |
| Accuracy | May miss some days | Complete record |
| Details | Only count per day | Includes correct/incorrect breakdown |
| Loading Time | Instant | May need to load all questions |

## Using the Data

The extension will automatically:
1. Check for review table data first
2. Fall back to heatmap if review table is not available
3. Merge data sources for the most complete picture

## Troubleshooting

- **No data found**: Make sure you're on the Review Questions page
- **Partial data**: Click "Show all questions" to load complete history
- **Date parsing issues**: The extension handles dates in "DD MMM YY" format (e.g., "22 Nov 25")

## Technical Details

The extraction works by:
1. Finding all `<table>` elements on the page
2. Looking for rows with the date pattern
3. Checking for tick/cross images to determine correctness
4. Parsing question titles and difficulty levels
5. Aggregating by date

The data is then converted to match the existing heatmap format for consistency.