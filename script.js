// --- JavaScript for Tabs ---
const tabButtonContainers = document.querySelectorAll('.tab-buttons');

tabButtonContainers.forEach(container => {
    container.addEventListener('click', (event) => {
        // Check if the clicked element is actually a button inside the container
        if (event.target.classList.contains('tab-button')) {
            const clickedButton = event.target;
            const targetTabId = clickedButton.dataset.tab; // e.g., "innsbruck-cam"

            // Find the closest parent weather-section to scope the changes
            const parentSection = clickedButton.closest('.weather-section');
            if (!parentSection) return; // Should not happen, but safe check

            // --- Within the specific parent section ---
            // Deactivate all buttons in this section
            parentSection.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            // Deactivate all content panels in this section
            parentSection.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // Activate the clicked button
            clickedButton.classList.add('active');

            // Activate the corresponding content panel within this section
            const targetContent = parentSection.querySelector('#' + targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        }
    });
});


// --- JavaScript for fetching and displaying hourly station data ---
const JSON_DATA_URL = 'https://wiski.tirol.gv.at/lawine/produkte/ogd.geojson';

async function fetchAndUpdateStationData() {
    console.log("Fetching station data..."); // Log start
    try {
        const response = await fetch(JSON_DATA_URL, { cache: 'no-store' }); // Try to prevent caching
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Data fetched successfully."); // Log success

        // GeoJSON structure has data in the 'features' array
        if (data && data.features) {
            processStationData(data.features);
        } else {
             console.error("Unexpected JSON structure:", data);
             updateAllPlaceholders("Error: Invalid data");
        }

    } catch (error) {
        console.error('Error fetching station data:', error);
        updateAllPlaceholders(`Error: ${error.message}`); // Show specific error
    }
}

function processStationData(features) {
    console.log(`Processing ${features.length} stations...`);
    let processedCount = 0;
    features.forEach(station => {
        if (!station || !station.properties || !station.geometry) return; // Skip invalid entries

        const props = station.properties;
        const name = props.name;

        // Skip if essential data is missing
        if (!name || typeof props.WG === 'undefined' || !props.date) {
             // console.warn(`Skipping station due to missing data: ${name || 'Unnamed'}`); // Optional: Keep console cleaner
             return;
        }

        // Generate IDs based on the station name
        const baseId = `station-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; // Sanitize name for ID
        const windElementId = `${baseId}-wind`;
        const timeElementId = `${baseId}-time`;

        const windElement = document.getElementById(windElementId);
        const timeElement = document.getElementById(timeElementId);

        // Only update if matching placeholder elements exist in the HTML
        if (windElement && timeElement) {
            // Extract data
            const windSpeed = props.WG;      // Average wind speed (km/h?)
            const windGust = props.WG_BOE;   // Gust speed (km/h?)
            const windDirection = props.WR;  // Direction in degrees
            const dateStr = props.date;      // Timestamp string

            // Format display strings
            let windText = formatWindData(windSpeed, windGust, windDirection);
            let timeText = formatDataTimestamp(dateStr);

            // Update the HTML content
            windElement.textContent = windText;
            timeElement.textContent = timeText;
            processedCount++;
        }
    });
    console.log(`Updated data for ${processedCount} stations.`);
    // Mark any remaining "Loading..." placeholders as N/A
    updateRemainingPlaceholders();
}

// --- Helper Functions (Formatters, Error Handling) ---
function formatWindData(speed, gust, direction) {
     let text = (typeof speed === 'number') ? `${speed.toFixed(1)} km/h` : "N/A";
     if (typeof gust === 'number' && gust > 0 && Math.abs(gust - speed) > 0.1) { // Add gust if available and significantly different
         text += ` (Gusts ${gust.toFixed(1)} km/h)`;
     }
     if (typeof direction === 'number') {
         text += ` from ${convertDegToCompass(direction)}`;
     }
     return text;
}

function formatDataTimestamp(dateStr) {
     if (!dateStr) return "--:--";
     try {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
     } catch(e) {
         console.error("Error parsing date:", dateStr, e);
         return "--:--";
     }
}

 function convertDegToCompass(deg) {
     if (typeof deg !== 'number' || isNaN(deg)) return '';
     const val = Math.floor((deg / 22.5) + 0.5);
     const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
     return arr[(val % 16)];
 }

function updateAllPlaceholders(message) {
     document.querySelectorAll('.wind-data, .time-data').forEach(span => {
        if (span.textContent === 'Loading...') {
             span.textContent = message;
         }
     });
 }

 function updateRemainingPlaceholders() {
     updateAllPlaceholders("N/A");
 }


// --- Run on page load ---
// Note: DOMContentLoaded is okay here because script is loaded with "defer" in HTML
fetchAndUpdateStationData();

// Optional: Auto-refresh data (e.g., every 30 minutes)
const refreshIntervalMinutes = 30;
setInterval(fetchAndUpdateStationData, refreshIntervalMinutes * 60 * 1000);