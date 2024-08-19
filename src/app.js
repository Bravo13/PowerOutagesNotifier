let CLIENT_ID, API_KEY;
let DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";
let SCOPES = "https://www.googleapis.com/auth/calendar";

let gapiInited = false;

let queuesDict;

const EVENT_TITLE = 'Відсутність електрики';

const MONTH_MAP = {
    'січня': '01',
    'лютого': '02',
    'березня': '03',
    'квітня': '04',
    'травня': '05',
    'червня': '06',
    'липня': '07',
    'серпня': '08',
    'вересня': '09',
    'жовтня': '10',
    'листопада': '11',
    'грудня': '12'
};

window['moment-range'].extendMoment(moment);

function loadConfig() {
    return fetch('src/config.json')
        .then(response => response.json())
        .then(config => {
            CLIENT_ID = config.CLIENT_ID;
            API_KEY = config.API_KEY;
        })
        .catch(error => {
            console.error('Error loading config:', error);
        });
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => { resolve(script)};
        script.onerror = () => reject(new Error(`Failed to load script ${src}`));
        document.head.append(script);
    });
}

function initGapi() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: [DISCOVERY_DOC],
                });
                gapiInited = true;
                resolve(true);
            } catch(error) {
                reject(error);
            }
        });
    });
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
}

function appLoaded() {
    hideLoading();
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
        throw (resp);
        }
        await drawInterface();
        showInterface();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({prompt: ''});
    }
}

async function drawInterface() {
    let response;
    const request = {
        minAccessRole: 'writer'
    };
    try {
        response = await gapi.client.calendar.calendarList.list(request);

        // Drawing calendars
        if(response.result.items.length){
            var container = jQuery('#calendarsList');
            response.result.items.forEach((item, index) => {
                const template = `
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" role="switch" value="${item.id}" id="calendarSwitchDefault${index}" name="calendars">
                        <label class="form-check-label" for="calendarSwitchDefault${index}">${item.summary}</label>
                    </div>
                `;
                var checkbox = $(template);
                container.append(checkbox);
            })
        }
    } catch(error) {
        console.error("Failed to list calendars", error);
    }
}

async function runApp() {
    try {
    } catch(error) {
        console.error('Failed to star app', error);
    }
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';
}

function showInterface() {
    document.getElementById('app').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

function hideProcessButton() {
    document.getElementById('process_button').style.display = 'none';
    document.getElementById('sendEventsButton').style.display = 'block';
}

function processData() {
    const textSchedule = $('#textSchedule').val();
    const date = parseDate(textSchedule);

    if(date == undefined){
        alert('Не зміг знайти дату');
        return;
    }

    if( textSchedule == "" ){
        alert('Введіть текст графіку відключень');
        return;
    }

    queuesDict = parseSchedule(textSchedule, date);
    showQueues(queuesDict.items);

    hideProcessButton();
}

function showQueues(queuesList) {
    var container = jQuery('#queuesList');
    Object.keys(queuesList).forEach((item) => {
        const template = `
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" role="switch" value="${item}" id="queueSwitchDefault${item}" name="queues">
                <label class="form-check-label" for="queueSwitchDefault${item}">${queuesList[item].title}</label>
            </div>
        `;
        var checkbox = $(template);
        container.append(checkbox);
    });
    container.show();
}

function parseDate(textSchedule){
    const regex = /(\d+)\s*?(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)/;
    const match = textSchedule.match(regex);
    if(!match) {
        return undefined;
    }
    const [wholeMatch, day, month] = match;
    const monthNumber = MONTH_MAP[month];
    const date = moment(`2024-${monthNumber}-${day}`, 'YYYY-MM-DD');
    return date.format('YYYY-MM-DD');
}

function parseSchedule(textSchedule, date) {
    const regex = /^[^\d]*(\d{2}:\d{2})-(\d{2}:\d{2})\s+((?:(?:\d)[^\d]*?)+)$/gm;
    let matches;

    let queuesDict = {
        ranges: [],
        range: undefined,
        items: []
    };

    while ((matches = regex.exec(textSchedule)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (matches.index === regex.lastIndex) {
            regex.lastIndex++;
        }

        // Matches will contain the full match and the capture groups
        const [fullMatch, startTime, endTime, queues] = matches;
        const queuesList = queues.match(/\d/g);

        queuesList
            .filter(item => queuesDict.items[item] === undefined)
            .forEach( item => queuesDict.items[item] = {title:`Черга ${item}`, timeRanges:[]});

        queuesList.forEach(
            item => {
                const rng = moment.range(
                    moment(`${date}T${startTime}`),
                    moment(`${date}T${endTime}`)
                );
                queuesDict.ranges.push(rng);
                queuesDict.items[item]
                        .timeRanges
                        .push(rng);
            }
        );
    } 
    [queuesDict.range] = mergeTimeRanges(queuesDict.ranges);
    Object.keys(queuesDict.items).forEach( index => queuesDict.items[index].timeRanges = mergeTimeRanges(queuesDict.items[index].timeRanges));
    return queuesDict;
}

function mergeTimeRanges(dateRanges) {
    dateRanges.sort((a, b) => a.start - b.start);
    const mergedRanges = [];
    let currentRange = dateRanges[0];

    for (let i = 1; i < dateRanges.length; i++) {
        if (
            currentRange.overlaps(dateRanges[i])
            || currentRange.adjacent(dateRanges[i]))
        {
            currentRange = currentRange.add(dateRanges[i], { adjacent: true });
        } else {
            mergedRanges.push(currentRange);
            currentRange = dateRanges[i];
        }
    }

    // Push the last range
    mergedRanges.push(currentRange);

    return mergedRanges;
}

function createCalendarEvent( startTime, endTime, calendarId ) {
    const event = {
        'summary' : EVENT_TITLE,
        'start' : {
            'dateTime': startTime.format('YYYY-MM-DDTHH:mm:SSZ'),
            'timeZone' : 'Europe/Kyiv'
        },

        'end' : {
            'dateTime': endTime.format('YYYY-MM-DDTHH:mm:SSZ'),
            'timeZone' : 'Europe/Kyiv'
        },

        'reminders': {
            'useDefault': false,
            'overrides': [
                {'method': 'popup', 'minutes': 15}
            ]
        }
    };
    let request = gapi.client.calendar.events.insert({
        'calendarId': calendarId,
        'resource': event
    });

    request.execute((event) => console.info('Event created', event.htmlLink));
}

function listCalendarEvents(dateRange, calendarId) {
    let request = gapi.client.calendar.events.list({
        "calendarId": calendarId,
        "singleEvents" : true,
        "q": EVENT_TITLE,
        "orderBy" : "startTime",
        "timeMin":  dateRange.start.format('YYYY-MM-DDTHH:mm:SSZ'),
        "timeMax":  dateRange.end.format('YYYY-MM-DDTHH:mm:SSZ'),
    });
    return new Promise( (resolve, reject) => {
        request.execute( list => resolve(list.items) );
    });
}

function removeCalendarEvent(calendarId, eventId) {
    let request = gapi.client.calendar.events.delete({
        "calendarId": calendarId,
        "eventId": eventId
    });
    return new Promise( (resolve, reject) => {
        request.execute( list => resolve(list.items) );
    });
}

async function sendData() {
    const selectedQueues = $('[name="queues"]:checked').map(function() {
        return this.value;
    }).get();

    const selectedCalendars = $('[name="calendars"]:checked').map(function() {
        return this.value;
    }).get();

    if( selectedCalendars.length == 0){
        alert('Оберіть хочаб один календар');
        return;
    }

    for( queue of selectedQueues){
        const schedule = queuesDict.items[queue];
        if( schedule == undefined ) {
            console.error(`Schedule ${schedule} not defined in dict`);
            return;
        }

        for( calendarId of selectedCalendars ){
            const events = await listCalendarEvents(queuesDict.range, calendarId);
            console.log(events);
            for( oldEvent of events ){
                console.log('Removing event', oldEvent.id);
                await removeCalendarEvent(calendarId, oldEvent.id)
            }
            schedule.timeRanges.forEach((item) => createCalendarEvent(item.start, item.end, calendarId));
        }
    };
    alert('Готово, перевіряйте календар')
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Simulate loading configuration and scripts
        await loadConfig();
        await loadScript('https://apis.google.com/js/api.js');
        await loadScript('https://accounts.google.com/gsi/client');

        await initGapi();
        gisLoaded();
        appLoaded();

    } catch (error) {
        console.error('Error loading libraries:', error);
    }
});
