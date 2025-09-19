const url = "https://script.google.com/macros/s/AKfycbwaF6fjMSKBsactYtgMGsZRYM_Ey5ZKiW7RsIsIYic96gJVZOFS2G-wm3yV1E-8Xpvv/exec";
const formValues = [
    "bill",
    "speaker-list",
    "awaited-speaker"
];

let billDebates = [];

function parseDoc(doc) {
    // Get bill debate program items
    let programItems = [];
    for (const billLink of doc.getElementsByTagName("a")) {
        const href = billLink.getAttribute("href");
        if (href == null || !href.startsWith("http://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;page=0;query=BillId%3A")) {
            continue;
        }

        // Get program item
        let programItem = billLink;
        while (programItem.parentNode != null) {
            if (programItem.className == "programItem itemRow") {
                break;
            }
            programItem = programItem.parentNode;
        }
        programItems.push(programItem);
    }

    // Get minutes date
    const minutesDate = new Date(doc.getElementById("watermark").previousElementSibling.children[0].textContent);

    // Extract debate data
    billDebates = [];
    for (const programItem of programItems) {
        let billDebate = {};

        // Get bill ID and name
        let billLink = programItem.getElementsByTagName("a")[0];
        billDebate.billId = billLink.getAttribute("href").match(/BillId%3A(.*?)%/)[1];
        billDebate.billName = billLink.textContent;

        // Get start time
        let startTime = programItem.getElementsByClassName("timeStamp")[0].textContent;
        startTime = startTime.match(/\d.*/)[0];
        startTime = parseTime(minutesDate, startTime);
        billDebate.startTimeStamp = startTime;

        // Get debate list
        let debateList = programItem.querySelector("div[style=\"margin-left:21pt\"]");
        if (debateList == null) {
            continue;
        }

        // Get debate turns
        let debateTurns = [];
        for (const pair of debateList.textContent.split(".")) {
            let couple = pair.split(",");
            if (couple.length != 2) {
                continue;
            }

            let speaker = couple[0].trim();
            let time = parseTime(minutesDate, couple[1].trim());
            debateTurns.push({speaker: speaker, time: time});
        }
        billDebate.debateTurns = debateTurns;

        // If bill already in list
        const existingDebate = billDebates.find(({billId}) => billId === billDebate.billId);
        if (existingDebate) {
            existingDebate.debateTurns.push(...billDebate.debateTurns);
        }
        else {
            // Add to list
            billDebates.push(billDebate);
        }
    }

    // Return result
    return billDebates;
}

function fetchLiveMinutes() {
    fetch(url)
    .then(response => response.text())
    .then(data => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, "text/html");

        return doc;
    })
    .then(data => {
        if (data == null) {
            throw new Error("Data is null");
        }
        billDebates = parseDoc(data);
        document.getElementById("dataDump").innerHTML = JSON.stringify(billDebates);
        estimateTime();
    })
    .catch(error => {
        console.error("Failed to fetch data:", error);
    });
}

function parseTime(date, timeString) {
    const dateString = date.toLocaleDateString("en-US");
    const dateTime = new Date(`${dateString} ${timeString}`);
    return dateTime;
}

function countDown(date) {
    const now = new Date().getTime();
    let distance = date - now;
    const negative = distance < 0;
    distance = Math.abs(distance) / 1000;

    const days = Math.floor(distance / (24 * 60 * 60));
    const hours = Math.floor((distance % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((distance % (60 * 60)) / 60);
    const seconds = Math.floor((distance % 60));

    let result = `${days}d ${hours}h ${minutes}m ${seconds}s ${negative ? " ago" : ""}`;

    // Filter out leading values that have 0
    result = result.replace(/^(0[a-zA-Z]+ )*/g, "");

    return result;
}

function normaliseName(name) {
    name = name.toLowerCase();
    name = name.trim();
    name = name.replace(/^(mr|ms|mrs|dr) /, "");
    return name;
}

function estimateTime() {
    const expectedSpeakerList = document.getElementById("speaker-list").value.split("\n");
    const awaitedSpeaker = document.getElementById("awaited-speaker").value;
    const billId = billTitleToID(document.getElementById("bill").value);
    const billDebate = billDebates.find(billDebate => billDebate.billId === billId);

    // If bill not found, stop
    if (billDebate == null) {
        document.getElementById("time-estimate").textContent = "Estimated time: Unknown";
        return;
    }

    // Get number of lines before awaitedSpeaker
    let linesBeforeAwaitedSpeaker = 0;
    for (const expectedSpeaker of expectedSpeakerList) {
        if (normaliseName(expectedSpeaker) === normaliseName(awaitedSpeaker)) {
            break;
        }
        linesBeforeAwaitedSpeaker++;
    }
    if (linesBeforeAwaitedSpeaker === expectedSpeakerList.length) {
        linesBeforeAwaitedSpeaker = null;
    }

    // Get last matched speaker's timestamp
    let lastMatchEndTime = null;
    let linesBeforeLastMatchedSpeaker = 0;
    for (let i = billDebate.debateTurns.length - 1; i >= 0; i--) {
        const speaker = billDebate.debateTurns[i].speaker;
        let matchFound = false;
        for (let j = expectedSpeakerList.length - 1; j >= 0; j--) {
            const expectedSpeaker = expectedSpeakerList[j];
            if (normaliseName(speaker) === normaliseName(expectedSpeaker)) {
                lastMatchEndTime = billDebate.debateTurns[i].time;
                matchFound = true;
                linesBeforeLastMatchedSpeaker = j;
                break;
            }
        }
        if (matchFound) {
            break;
        }
    }

    // If insufficient data, set estimated time to unknown
    if (!linesBeforeAwaitedSpeaker || !lastMatchEndTime) {
        document.getElementById("time-estimate").textContent = "Estimated time: Unknown";
        return;
    }

    // Calculate estimated time
    const minutesToNextSpeaker = 15 * (linesBeforeAwaitedSpeaker - linesBeforeLastMatchedSpeaker);
    let expectedTime = new Date(lastMatchEndTime);
    expectedTime.setMinutes(expectedTime.getMinutes() + minutesToNextSpeaker);
    const expectedTimeText = `${expectedTime.getHours().toString().padStart(2, "0")}:${expectedTime.getMinutes().toString().padStart(2, "0")}:${expectedTime.getSeconds().toString().padStart(2, "0")}`;
    document.getElementById("time-estimate").textContent = `Estimated time: ${expectedTimeText}, ${countDown(expectedTime)}`;
}

function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;

    // Create a 2D array
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    // Initialise base cases
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    // Fill DP table
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1]; // No cost
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j], // Deletion
                    dp[i][j - 1], // Insertion
                    dp[i - 1][j - 1] // Substitution
                );
            }
        }
    }

    return dp[m][n];
}

function billTitleToID(title) {
    for (const billDebate of billDebates) {
        if (billTitleMatch(title, billDebate.billName)) {
            return billDebate.billId;
        }
    }
}

function billTitleMatch(title1, title2) {
    title1 = title1.toLowerCase().trim().replace(/ bill \d+$/, "").replaceAll(" ", "");
    title2 = title2.toLowerCase().trim().replace(/ bill \d+$/, "").replaceAll(" ", "");
    return levenshtein(title1, title2) <= 4;
}

function saveFormValuesToCookie() {
    const formValuesCookieName = "formValues";
    const expiratoryDate = new Date();
    expiratoryDate.setTime(expiratoryDate.getTime() + (365*24*60*60*1000));
    const expiryString = `expires=${expiratoryDate.toUTCString()}; path=/`;

    const formValuesJSON = JSON.stringify(Object.fromEntries(formValues.map(id => [id, document.getElementById(id).value])));
    const formValuesBase64 = btoa(formValuesJSON);
    document.cookie = `${formValuesCookieName}=${formValuesBase64}; ${expiryString}`;
}

function cleanTextArea(textAreaId) {
    const textArea = document.getElementById(textAreaId);
    const text = textArea.value;
    const lines = text.split("\n");
    const nonBlankLines = lines.filter(line => line.trim() !== "");
    textArea.value = nonBlankLines.join("\n");

    // Send input event
    const inputEvent = new Event("input", { bubbles: true });
    textArea.dispatchEvent(inputEvent);
}

// Fetch speaker history every 20 seconds
fetchLiveMinutes();
setInterval(fetchLiveMinutes, 20_000);

// Estimate time every second
estimateTime();
setInterval(estimateTime, 1_000);

// Estimate time when form values change
formValues.forEach(id => document.getElementById(id).addEventListener("input", estimateTime));

// Save form values to cookie when they change
formValues.forEach(id => document.getElementById(id).addEventListener("input", saveFormValuesToCookie));

// Load form values from cookie
const formValuesCookie = document.cookie.replace(/(?:(?:^|.*;\s*)formValues\s*\=\s*([^;]*).*$)|^.*$/, "$1");
if (formValuesCookie) {
    const formValuesJSON = atob(formValuesCookie);
    const formValues = JSON.parse(formValuesJSON);
    for (const [key, value] of Object.entries(formValues)) {
        document.getElementById(key).value = value;
    }
}

// Clean text areas when the user clicks away
formValues.forEach(id => document.getElementById(id).addEventListener("blur", () => cleanTextArea(id)));
