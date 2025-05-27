# Task Context: Full Page Screenshot Capture

## Task ID: SCREENSHOT-001

## User Request
The user wants to capture a full-page screenshot of the currently open tab (NU.nl article) by:
1. Taking a screenshot
2. Scrolling down 1080px
3. Taking another screenshot
4. Repeating until reaching the page bottom

## Current Browser State
- Tab ID: 9
- URL: https://www.nu.nl/binnenland/6357152/sloop-parkeergarage-nieuwegein-mag-jaar-na-instorting-beginnen.html
- Title: "Sloop parkeergarage Nieuwegein mag jaar na instorting beginnen | Binnenland | NU.nl"

## Requirements
- Use browser_action tool to launch browser and navigate to the URL
- Take initial screenshot
- Scroll down by 1080px increments
- Take screenshot after each scroll
- Continue until page bottom is reached
- Save all screenshots in the testing directory

## Expected Deliverables
- Multiple screenshot files capturing the entire page content
- Clear naming convention for the screenshots to maintain order
- Summary of all screenshots taken with their file locations