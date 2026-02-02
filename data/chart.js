// Chart.js implementation for heading and quality visualization
let headingQualityChart = null;
let chartData = {
    labels: [], // Time labels
    datasets: [
        {
            label: 'Heading (°)',
            data: [],
            borderColor: 'rgb(0, 0, 0)',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            yAxisID: 'y',
            tension: 0.1
        }
    ]
};

// Maximum number of data points to keep in the chart
const MAX_CHART_POINTS = 100;

// Initialize the chart
function initChart() {
    const ctx = document.getElementById('headingQualityChart');
    if (!ctx) {
        console.error('Chart canvas element not found');
        return;
    }

    headingQualityChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: {
                    display: false,
                    text: 'Heading'
                },
                legend: {
                    display: false,
                    position: 'top'
                },
                tooltip: {
                    enabled: false
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: false,
                        text: 'Time'
                    },
                    ticks: {
                        maxTicksLimit: 10
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: false,
                        text: 'Heading (°)'
                    },
                    min: 0,
                    max: 360,
                    ticks: {
                        stepSize: 45
                    }
                }
            },
            animation: {
                duration: 0 // Disable animations for real-time updates
            }
        }
    });
}

// Function to add new data point to the chart
function addChartDataPoint(heading) {
    if (!headingQualityChart) {
        console.warn('Chart not initialized');
        return;
    }

    // Create timestamp for x-axis
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();

    // Add new data points
    chartData.labels.push(timeLabel);
    chartData.datasets[0].data.push(heading);

    // Remove old data points if we exceed the maximum
    if (chartData.labels.length > MAX_CHART_POINTS) {
        chartData.labels.shift();
        chartData.datasets[0].data.shift();
    }

    // Update the chart
    headingQualityChart.update('none'); // 'none' mode for better performance
}

// Function to clear chart data
function clearChartData() {
    if (!headingQualityChart) {
        return;
    }

    chartData.labels = [];
    chartData.datasets[0].data = [];
    headingQualityChart.update();
}

// Function to toggle chart visibility
function toggleChart() {
    const chartContainer = document.getElementById('chart-container');
    if (chartContainer) {
        if (chartContainer.style.display === 'none') {
            chartContainer.style.display = 'block';
        } else {
            chartContainer.style.display = 'none';
        }
    }
}

// Initialize chart when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit to ensure Chart.js is loaded
    setTimeout(initChart, 100);
});