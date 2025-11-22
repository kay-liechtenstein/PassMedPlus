// Test script to extract review questions from PassMed
// Run this in the browser console when on the review questions page

// Function to extract questions from review table
function testExtractReviewQuestions() {
    console.log('Testing review questions extraction...');
    
    const questionsData = {
        daily: {},
        totalQuestions: 0,
        correctQuestions: 0,
        incorrectQuestions: 0,
        questions: []
    };
    
    // Look for the review questions table
    const reviewTables = document.querySelectorAll('table');
    console.log(`Found ${reviewTables.length} tables`);
    
    for (const table of reviewTables) {
        const rows = table.querySelectorAll('tr');
        console.log(`Checking table with ${rows.length} rows`);
        
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            
            if (cells.length >= 4) {
                // First cell contains the date
                const dateCell = cells[0];
                const dateText = dateCell.textContent.trim();
                
                // Check if this looks like a date (e.g., "22 Nov 25")
                if (dateText.match(/^\d{1,2}\s+\w{3}\s+\d{2}$/)) {
                    // Parse the date
                    const [day, monthAbbr, yearShort] = dateText.split(/\s+/);
                    const year = parseInt(yearShort) < 50 ? `20${yearShort}` : `19${yearShort}`;
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthIndex = monthNames.indexOf(monthAbbr);
                    
                    if (monthIndex !== -1) {
                        const dateObj = new Date(year, monthIndex, parseInt(day));
                        const dateKey = dateObj.toISOString().split('T')[0];
                        
                        // Check if correct or incorrect based on image
                        const resultCell = cells[2];
                        const isCorrect = resultCell.innerHTML.includes('small_tick.gif');
                        const isIncorrect = resultCell.innerHTML.includes('small_cross.gif');
                        
                        if (isCorrect || isIncorrect) {
                            // Extract question details
                            const questionCell = cells[1];
                            const titleMatch = questionCell.innerHTML.match(/<b>(.*?)<\/b>/);
                            const title = titleMatch ? titleMatch[1] : '';
                            
                            // Count difficulty (number of hammer icons)
                            const hammerCount = (questionCell.innerHTML.match(/icon-hammer/g) || []).length;
                            
                            // Check for multi-part questions (EMQ, etc.)
                            let questionCount = 1;
                            
                            // Check for EMQ (Extended Matching Questions) badge
                            if (questionCell.innerHTML.includes('badge') && questionCell.innerHTML.includes('EMQ')) {
                                questionCount = 3; // EMQs typically have 3 parts
                                console.log(`Found EMQ (3 questions): ${title}`);
                            }
                            
                            // Check for other patterns that indicate multiple questions
                            // Look for patterns like "(3 items)" or "3 questions" in the text
                            const multiPartMatch = questionCell.textContent.match(/\((\d+)\s*(?:items?|questions?|parts?)\)/i);
                            if (multiPartMatch) {
                                questionCount = parseInt(multiPartMatch[1]);
                                console.log(`Found multi-part question (${questionCount} parts): ${title}`);
                            }
                            
                            // Also check for numbered sub-questions in the preview text
                            const numberedParts = questionCell.textContent.match(/(?:1\.|i\.|a\.).*(?:2\.|ii\.|b\.).*(?:3\.|iii\.|c\.)/);
                            if (numberedParts && questionCount === 1) {
                                // Likely a 3-part question
                                questionCount = 3;
                                console.log(`Detected numbered sub-questions (3 parts): ${title}`);
                            }
                            
                            // Add to daily count
                            if (!questionsData.daily[dateKey]) {
                                questionsData.daily[dateKey] = { total: 0, correct: 0, incorrect: 0 };
                            }
                            
                            questionsData.daily[dateKey].total += questionCount;
                            questionsData.totalQuestions += questionCount;
                            
                            if (isCorrect) {
                                questionsData.daily[dateKey].correct += questionCount;
                                questionsData.correctQuestions += questionCount;
                            } else {
                                questionsData.daily[dateKey].incorrect += questionCount;
                                questionsData.incorrectQuestions += questionCount;
                            }
                            
                            // Store question details
                            questionsData.questions.push({
                                date: dateKey,
                                title: title,
                                difficulty: hammerCount,
                                correct: isCorrect,
                                dateText: dateText,
                                questionCount: questionCount,
                                isMultiPart: questionCount > 1
                            });
                            
                            console.log(`Found question: ${dateText} - ${title} - ${isCorrect ? 'Correct' : 'Incorrect'} - Count: ${questionCount}`);
                        }
                    }
                }
            }
        }
    }
    
    console.log('=== EXTRACTION RESULTS ===');
    console.log(`Total questions: ${questionsData.totalQuestions}`);
    console.log(`Correct: ${questionsData.correctQuestions} (${(questionsData.correctQuestions/questionsData.totalQuestions*100).toFixed(1)}%)`);
    console.log(`Incorrect: ${questionsData.incorrectQuestions} (${(questionsData.incorrectQuestions/questionsData.totalQuestions*100).toFixed(1)}%)`);
    
    // Count multi-part questions
    const multiPartQuestions = questionsData.questions.filter(q => q.isMultiPart);
    const totalQuestionItems = questionsData.questions.length;
    console.log(`\nMulti-part questions: ${multiPartQuestions.length} out of ${totalQuestionItems} items`);
    
    if (multiPartQuestions.length > 0) {
        console.log('Multi-part breakdown:');
        const countBreakdown = {};
        multiPartQuestions.forEach(q => {
            countBreakdown[q.questionCount] = (countBreakdown[q.questionCount] || 0) + 1;
        });
        Object.entries(countBreakdown).forEach(([count, num]) => {
            console.log(`  ${count}-part questions: ${num}`);
        });
    }
    
    console.log('\nQuestions by date:');
    
    // Sort dates
    const sortedDates = Object.keys(questionsData.daily).sort();
    for (const date of sortedDates) {
        const stats = questionsData.daily[date];
        console.log(`${date}: ${stats.total} questions (${stats.correct} correct, ${stats.incorrect} incorrect)`);
    }
    
    return questionsData;
}

// Function to click "Show all questions" and then extract
async function testExtractAllQuestions() {
    const showAllButton = document.querySelector('#showallquestions');
    if (showAllButton) {
        console.log('Clicking "Show all questions" button...');
        showAllButton.click();
        
        // Wait for loading to complete
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                const button = document.querySelector('#showallquestions');
                if (!button || !button.textContent.includes('Loading')) {
                    clearInterval(checkInterval);
                    setTimeout(resolve, 500);
                }
            }, 100);
        });
        
        console.log('All questions loaded, extracting...');
    }
    
    return testExtractReviewQuestions();
}

// Run the test
console.log('To test extraction of visible questions, run: testExtractReviewQuestions()');
console.log('To load ALL questions and extract, run: testExtractAllQuestions()');