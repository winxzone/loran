const ws = new WebSocket('ws://localhost:4002')

let measurements = {}

function tdoaError(params, x1, y1, x2, y2, x3, y3, delta_t12, delta_t13, c) {
	const [x, y] = params
	const d1 = Math.sqrt((x - x1) ** 2 + (y - y1) ** 2)
	const d2 = Math.sqrt((x - x2) ** 2 + (y - y2) ** 2)
	const d3 = Math.sqrt((x - x3) ** 2 + (y - y3) ** 2)

	const delta_t12_calc = (d1 - d2) / c
	const delta_t13_calc = (d1 - d3) / c

	const error1 = delta_t12_calc - delta_t12
	const error2 = delta_t13_calc - delta_t13

	return [error1, error2]
}

function lossFunction(params, tdoaErrorFunc, args) {
	const errors = tdoaErrorFunc(params, ...args)
	const loss = errors.reduce((acc, e) => acc + e ** 2, 0)
	return loss
}

function customLeastSquares(
	tdoaErrorFunc,
	initial_guess,
	args,
	learning_rate = 0.01,
	max_iterations = 10000,
	tolerance = 1e-12
) {
	let [x, y] = initial_guess
	let iteration = 0
	let prev_loss = Infinity

	while (iteration < max_iterations) {
		const loss = lossFunction([x, y], tdoaErrorFunc, args)

		if (Math.abs(prev_loss - loss) < tolerance) {
			break
		}

		prev_loss = loss

		const delta = 1e-6
		const loss_x = lossFunction([x + delta, y], tdoaErrorFunc, args)
		const grad_x = (loss_x - loss) / delta

		const loss_y = lossFunction([x, y + delta], tdoaErrorFunc, args)
		const grad_y = (loss_y - loss) / delta

		x -= learning_rate * grad_x
		y -= learning_rate * grad_y

		iteration++
	}

	return [x, y, iteration]
}

// Ініціалізація графіка з базовими станціями
const ctx = document.getElementById('loranChart').getContext('2d')
const stations = [
	{ x: 0, y: 0 },
	{ x: 100000, y: 0 },
	{ x: 0, y: 100000 },
]

const loranChart = new Chart(ctx, {
	type: 'scatter',
	data: {
		datasets: [
			{
				label: 'Станції',
				data: stations,
				backgroundColor: 'blue',
				pointRadius: 10,
			},
			{
				label: 'Орієнтовне місцезнаходження',
				data: [],
				backgroundColor: 'red',
				pointRadius: 10,
			},
		],
	},
	options: {
		responsive: false,
		scales: {
			x: {
				type: 'linear',
				position: 'bottom',
				min: 0,
				max: 100000,
			},
			y: {
				type: 'linear',
				min: 0,
				max: 100000,
			},
		},
	},
})

function updatePlot(receiver_x, receiver_y) {
	loranChart.data.datasets[1].data = [{ x: receiver_x, y: receiver_y }]
	loranChart.update()
}

ws.onmessage = event => {
	const data = JSON.parse(event.data)
	const { id, sourceId, receivedAt } = data

	if (!measurements[id]) {
		measurements[id] = {}
	}
	measurements[id][sourceId] = receivedAt

	if (Object.keys(measurements[id]).length === 3) {
		const receivedAt1 = measurements[id]['source1']
		const receivedAt2 = measurements[id]['source2']
		const receivedAt3 = measurements[id]['source3']

		const delta_t12 = ((receivedAt1 - receivedAt2) / 1000) * 10e8
		const delta_t13 = ((receivedAt1 - receivedAt3) / 1000) * 10e8

		const initial_guess = [50000, 50000]
		const c = 3e8 / 10e8

		const [x_opt, y_opt] = customLeastSquares(tdoaError, initial_guess, [
			stations[0].x,
			stations[0].y,
			stations[1].x,
			stations[1].y,
			stations[2].x,
			stations[2].y,
			delta_t12,
			delta_t13,
			c,
		])

		updatePlot(x_opt, y_opt)
		measurements = {}
	}
}

// Зміна швидкості об'єкта
async function updateObjectSpeed(speed) {
	const response = await fetch('http://localhost:4002/config', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ objectSpeed: speed }),
	})
	return response.json()
}

document.getElementById('submit-speed').addEventListener('click', async () => {
	const speed = document.getElementById('speed-input').value
	if (speed) {
		const response = await updateObjectSpeed(parseFloat(speed))
		document.getElementById(
			'speed-response'
		).innerText = `Швидкість об'єкта змінена на: ${response.objectSpeed} км/год`
	} else {
		document.getElementById('speed-response').innerText =
			"Введіть швидкість і натисніть 'Задати швидкість'."
	}
})
