var usermap = {};

var msgbfr = "";
function main()
{
	let connected = false;
	let socket = network.createSocket();

	function connect()
	{
		if (connected) return;
		socket.connect(8088, "127.0.0.1", () => {
			connected = true;
		});
	}

	socket.on("close", () => {
		connected = false;
		connect();
	});

	socket.on("error", (err) => {
		if (err.toString().includes("timed out"))
		{
			connected = false;
			socket.destroy("Time out");
			connect();
		}
		else console.log("Connection error: " + err);
	})

	socket.on("data", (msg) => {
		msgbfr += msg;
		while (msgbfr.includes("\n"))
		{
			let ndx = msgbfr.indexOf("\n");
			receiveData(msgbfr.substring(0, ndx));
			msgbfr = msgbfr.slice(ndx + 1);
		}
	});

	connect();
}

function receiveData(obj)
{
	console.log(obj);
	let data = JSON.parse(obj);
	switch (data.type)
	{
		case 'nameguest':
			nameRandomPeep(data, "guest", false);
			break;

		case 'sendmoney':
			nameRandomPeep(data, "guest", true);
			giveMoney(data);
			break;

		case 'namestaff':
			// 3 possible situations:
			// - guest with this name, unname guest, name random staff member
			// - staff with this name, do nothing
			// - nobody with this name, name random staff member
			let peep = findPeep(data);
			if (peep)
			{
				if (peep.peepType === 'guest')
					peep.name = "John D.";
				else break;
			}
			nameRandomPeep(data, "staff", true);

			break;

		case 'remove':
			if (data.explode) kill(data);
			removeName(data);
			break;

		case 'celebrate':
			celebrate(data);
			break;
	}
}

function findPeep(data)
{
	let eid = usermap[data.userid].eid;
	if (!eid) return null;

	let peeps = map.getAllEntities('peep');
	for (let i = 0; i < peeps.length; i++)
		if (peeps[i].id === eid) return peeps[i];

	return null;
}

function peepFilter(peeps, peepType)
{
	if (peepType === 'staff') return peeps;

	peeps.sort((a,b) => b.cash - a.cash);
	peeps = peeps.slice(0, 30);

	return peeps;
}

const HAPPINESS_BONUS = 20;
const ENERGY_BONUS = 5;

function nameRandomPeep(data, peepType, force)
{
	var candidates = [];
	var allpeeps = map.getAllEntities('peep');

	var peep = null;
	for (let i = 0; i < allpeeps.length; i++)
	{
		let entity = allpeeps[i];
        if (entity.peepType === peepType)
		{
			// we already got one of those
			if (entity.name === data.name)
			{
				peep = entity;
				break;
			}

			// this is not a named peep
			if (entity.name.includes(' ')) candidates.push(entity);
		}
    }

	if (!peep)
	{
		// no guests without a name
		if (candidates.length == 0)
		{
			if (!force) return null;
			candidates = peepFilter(allpeeps, peepType);
		}

		// if we got here and there are still no candidates, nothing to do
		if (candidates.length == 0) return null;
		peep = candidates[Math.floor(Math.random() * candidates.length)];
	}

	peep.name = data.name;
	usermap[data.userid] = { eid: peep.id, dollars: 0, };

	//peep.tshirtColour = ???

	peep.setFlag("tracking", true);
	if (peep.happinessTarget < 255 - HAPPINESS_BONUS)
		peep.happinessTarget += HAPPINESS_BONUS;
	if (peep.energyTarget < 128 - ENERGY_BONUS)
		peep.energyTarget += ENERGY_BONUS;

	return peep;
}

function giveMoney(data)
{
	var peep = findPeep(data);
	if (!peep) return null;

	// don't do anything else if there's no money being added
	if (data.dollars == 0) return peep;

	// cash is stored in dimes
	usermap[data.userid].dollars += data.dollars;
	peep.cash += data.dollars * 10;

	// guests given cash probably shouldn't bolt for the door
	if (data.dollars >= 100)
	{
		// random values within acceptable tolerance to not re-trigger leaving park flag
		let newhappiness = Math.max(peep.happinessTarget, 105 + Math.round(Math.random() * 150));
		peep.happiness = peep.happinessTarget = newhappiness;

		let newenergy = Math.max(peep.energyTarget, 64 + Math.round(Math.random() * 64));
		peep.energy = peep.energyTarget = newenergy;

		peep.hunger = 255;
		peep.thirst = 255;
		peep.toilet = 0;
		peep.nausea = 0;

		peep.setFlag("leavingPark", false);
	}

	// post a park message (use dollars descriptor, not bits)
	park.postMessage({
		type: 'peep',
		text: data.name + " just found $" + data.dollars,
		subject: peep.id,
	});
	return peep;
}

function celebrate(data)
{
	// post a park message
	park.postMessage({
		type: 'award',
		text: data.message,
	});
}

function kill(data)
{
	var peep = findPeep(data);
	if (!peep) return null;

	peep.setFlag("explode", true);
	return peep;
}

function removeName(data)
{
	var peep = findPeep(data);
	if (!peep) return null;

	if (peep.peepType === "guest")
		peep.name = "John D.";
	else
	{
		var job = peep.staffType;
		peep.name = "Unnamed " + job.charAt(0).toUpperCase() + job.slice(1);
	}
	return peep;
}

registerPlugin({
    name: "TwitchTools",
    version: "0.1",
    licence: "MIT",
    authors: ["authorblues"],
    type: "local",
    main: main
});
