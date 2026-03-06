// Chart.js implementation for heading and quality visualization
let headingQualityChart = null;
let chartData = {
    labels: [], // Time labels
    datasets: [
        {
            label: 'UNIHEADINGA',
            data: [],
            borderColor: 'rgb(0, 0, 0)',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            yAxisID: 'y',
            tension: 0.1
        },
        {
            label: 'THS',
            data: [],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            yAxisID: 'y',
            tension: 0.1
        },
        {
            label: 'HPR',
            data: [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
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
                    display: true,
                    position: 'top',
                    labels: {
                        generateLabels: function(chart) {
                            const datasets = chart.data.datasets;
                            return datasets.map((dataset, i) => {
                                const data = dataset.data;
                                const lastValue = data.length > 0 ? data[data.length - 1] : '-';
                                const displayValue = lastValue !== '-' ? lastValue.toFixed(2) + '°' : '-';
                                return {
                                    text: dataset.label + ': ' + displayValue,
                                    fillStyle: dataset.borderColor,
                                    strokeStyle: dataset.borderColor,
                                    lineWidth: 2,
                                    hidden: false,
                                    index: i,
                                    datasetIndex: i
                                };
                            });
                        }
                    }
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

// Function to calculate dynamic Y-axis range
function calculateDynamicRange() {
    // Collect all heading values from all datasets
    let allValues = [];
    chartData.datasets.forEach(dataset => {
        allValues = allValues.concat(dataset.data.filter(v => v !== null && v !== undefined));
    });

    if (allValues.length === 0) {
        return { min: 0, max: 360 };
    }

    // Use the most recent value as center for handling wrapping
    const centerValue = allValues[allValues.length - 1];

    // Adjust values to handle wrapping around 0/360
    const adjustedValues = allValues.map(heading => {
        let adjustedHeading = heading;
        if (Math.abs(heading - centerValue) > 180) {
            if (heading < centerValue) {
                adjustedHeading = heading + 360;
            } else {
                adjustedHeading = heading - 360;
            }
        }
        return adjustedHeading;
    });

    const dataMin = Math.min(...adjustedValues);
    const dataMax = Math.max(...adjustedValues);
    const dataRange = dataMax - dataMin;

    // Add 20% padding to the range, with minimum padding of 5 degrees
    const padding = Math.max(dataRange * 0.2, 5);
    let minY = dataMin - padding;
    let maxY = dataMax + padding;

    // Normalize back to 0-360 range if needed
    while (minY < 0) {
        minY += 360;
        maxY += 360;
    }
    while (minY >= 360) {
        minY -= 360;
        maxY -= 360;
    }

    // If the range is too large (> 180 degrees), use full 0-360 range
    if (maxY - minY > 180) {
        return { min: 0, max: 360 };
    }

    return { min: Math.floor(minY), max: Math.ceil(maxY) };
}

// Function to add new data point to the chart
function addChartDataPoint(heading, ths, hpr) {
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
    chartData.datasets[1].data.push(ths);
    chartData.datasets[2].data.push(hpr);

    // Remove old data points if we exceed the maximum
    if (chartData.labels.length > MAX_CHART_POINTS) {
        chartData.labels.shift();
        chartData.datasets[0].data.shift();
        chartData.datasets[1].data.shift();
        chartData.datasets[2].data.shift();
    }

    // Update Y-axis range dynamically
    const range = calculateDynamicRange();
    headingQualityChart.options.scales.y.min = range.min;
    headingQualityChart.options.scales.y.max = range.max;
    
    // Adjust tick step size based on range
    const rangeSize = range.max - range.min;
    headingQualityChart.options.scales.y.ticks.stepSize = rangeSize <= 90 ? 15 : 45;

    // Update the chart with legend refresh
    headingQualityChart.update('none'); // 'none' mode for better performance
    
    // Force legend update to show current values
    if (headingQualityChart.options.plugins.legend.labels.generateLabels) {
        headingQualityChart.legend.legendItems = headingQualityChart.options.plugins.legend.labels.generateLabels(headingQualityChart);
    }
}

// Function to clear chart data
function clearChartData() {
    if (!headingQualityChart) {
        return;
    }

    chartData.labels = [];
    chartData.datasets[0].data = [];
    chartData.datasets[1].data = [];
    chartData.datasets[2].data = [];
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