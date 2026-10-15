import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createRequire } from 'node:module';

// Load the CommonJS app through require so the app and the tests share one Mongoose instance
const require = createRequire(import.meta.url);
const app = require('../src/app.js');
const Event = require('../src/models/Event.js');
const Registration = require('../src/models/Registration.js');
const mongoose = require('mongoose');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Registration.init(); // make sure the unique index exists
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Event.deleteMany({});
  await Registration.deleteMany({});
});

const validEvent = (overrides = {}) => ({
  title: 'Node Meetup',
  description: 'Talks about Node.js',
  date: '2099-01-15',
  time: '18:30',
  location: 'Hyderabad',
  organizer: 'NxtLabTech',
  capacity: 2,
  ...overrides,
});

const createEvent = async (overrides) => (await request(app).post('/api/events').send(validEvent(overrides))).body;

describe('events', () => {
  test('creates an event', async () => {
    const res = await request(app).post('/api/events').send(validEvent());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Node Meetup', capacity: 2 });
    expect(res.body._id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
  });

  test('rejects invalid event data with 400', async () => {
    const res = await request(app)
      .post('/api/events')
      .send(validEvent({ title: '', date: '2026-02-31', capacity: 0 }));
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['title', 'date', 'capacity']));
  });

  test('rejects overly long title', async () => {
    const res = await request(app).post('/api/events').send(validEvent({ title: 'x'.repeat(101) }));
    expect(res.status).toBe(400);
    expect(res.body.details.title).toBeDefined();
  });

  test('lists events sorted by date', async () => {
    await createEvent({ title: 'Later', date: '2099-05-01' });
    await createEvent({ title: 'Sooner', date: '2099-02-01' });
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => e.title)).toEqual(['Sooner', 'Later']);
    expect(res.body.page).toBe(1);
    expect(res.body.totalEvents).toBe(2);
    expect(res.body.totalPages).toBe(1);
  });

  test('paginates events using page and limit', async () => {
    await createEvent({ title: 'Event 1', date: '2099-01-01' });
    await createEvent({ title: 'Event 2', date: '2099-01-02' });
    await createEvent({ title: 'Event 3', date: '2099-01-03' });

    const page1 = await request(app).get('/api/events?page=1&limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.events).toHaveLength(2);
    expect(page1.body.events.map((e) => e.title)).toEqual(['Event 1', 'Event 2']);
    expect(page1.body.page).toBe(1);
    expect(page1.body.limit).toBe(2);
    expect(page1.body.pageSize).toBe(2);
    expect(page1.body.totalEvents).toBe(3);
    expect(page1.body.totalPages).toBe(2);

    const page2 = await request(app).get('/api/events?page=2&limit=2');
    expect(page2.status).toBe(200);
    expect(page2.body.events).toHaveLength(1);
    expect(page2.body.events.map((e) => e.title)).toEqual(['Event 3']);
    expect(page2.body.page).toBe(2);
  });

  test('searches events by name and location', async () => {
    await createEvent({ title: 'React Workshop', location: 'Bengaluru' });
    await createEvent({ title: 'Node Summit', location: 'Hyderabad' });
    await createEvent({ title: 'Design Meetup', location: 'Goa' });

    // Search by title (case-insensitive)
    const titleMatch = await request(app).get('/api/events?search=react');
    expect(titleMatch.status).toBe(200);
    expect(titleMatch.body.events).toHaveLength(1);
    expect(titleMatch.body.events[0].title).toBe('React Workshop');

    // Search by location (case-insensitive)
    const locMatch = await request(app).get('/api/events?search=HYDERABAD');
    expect(locMatch.status).toBe(200);
    expect(locMatch.body.events).toHaveLength(1);
    expect(locMatch.body.events[0].title).toBe('Node Summit');

    // Search with no matching records
    const noMatch = await request(app).get('/api/events?search=nonexistent');
    expect(noMatch.status).toBe(200);
    expect(noMatch.body.events).toHaveLength(0);
    expect(noMatch.body.totalEvents).toBe(0);
    expect(noMatch.body.totalPages).toBe(0);
  });

  test('gets an event by id with registration count', async () => {
    const event = await createEvent();
    const res = await request(app).get(`/api/events/${event._id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Node Meetup');
    expect(res.body.registrationCount).toBe(0);
  });

  test('returns 404 for unknown or malformed event id', async () => {
    const missing = await request(app).get(`/api/events/${new mongoose.Types.ObjectId()}`);
    expect(missing.status).toBe(404);
    const malformed = await request(app).get('/api/events/not-an-id');
    expect(malformed.status).toBe(404);
  });

  test('updates an event', async () => {
    const event = await createEvent();
    const res = await request(app)
      .put(`/api/events/${event._id}`)
      .send(validEvent({ title: 'Renamed', capacity: 10 }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Renamed', capacity: 10 });
  });

  test('does not allow capacity below current registrations', async () => {
    const event = await createEvent({ capacity: 2 });
    await request(app).post(`/api/events/${event._id}/register`).send({ name: 'A', email: 'a@x.com' });
    await request(app).post(`/api/events/${event._id}/register`).send({ name: 'B', email: 'b@x.com' });
    const res = await request(app).put(`/api/events/${event._id}`).send(validEvent({ capacity: 1 }));
    expect(res.status).toBe(400);
    expect(res.body.details.capacity).toBeDefined();
  });

  test('update of missing event returns 404', async () => {
    const res = await request(app).put(`/api/events/${new mongoose.Types.ObjectId()}`).send(validEvent());
    expect(res.status).toBe(404);
  });

  test('deletes an event and its registrations', async () => {
    const event = await createEvent();
    await request(app).post(`/api/events/${event._id}/register`).send({ name: 'A', email: 'a@x.com' });
    const res = await request(app).delete(`/api/events/${event._id}`);
    expect(res.status).toBe(200);
    expect((await request(app).get(`/api/events/${event._id}`)).status).toBe(404);
    expect(await Registration.countDocuments()).toBe(0);
  });
});

describe('registrations', () => {
  test('registers a participant and lists them', async () => {
    const event = await createEvent();
    const res = await request(app)
      .post(`/api/events/${event._id}/register`)
      .send({ name: 'Asha', email: 'Asha@Example.com' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Asha', email: 'asha@example.com', eventId: event._id });

    const list = await request(app).get(`/api/events/${event._id}/registrations`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  test('rejects invalid name/email', async () => {
    const event = await createEvent();
    const res = await request(app).post(`/api/events/${event._id}/register`).send({ name: ' ', email: 'nope' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['name', 'email']));
  });

  test('rejects duplicate registration with 409', async () => {
    const event = await createEvent();
    const body = { name: 'Asha', email: 'asha@example.com' };
    await request(app).post(`/api/events/${event._id}/register`).send(body);
    const res = await request(app).post(`/api/events/${event._id}/register`).send({ ...body, email: 'ASHA@example.com' });
    expect(res.status).toBe(409);
  });

  test('rejects registration when capacity is reached', async () => {
    const event = await createEvent({ capacity: 1 });
    await request(app).post(`/api/events/${event._id}/register`).send({ name: 'A', email: 'a@x.com' });
    const res = await request(app).post(`/api/events/${event._id}/register`).send({ name: 'B', email: 'b@x.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/full/i);
  });

  test('registration for a nonexistent event returns 404', async () => {
    const id = new mongoose.Types.ObjectId();
    const post = await request(app).post(`/api/events/${id}/register`).send({ name: 'A', email: 'a@x.com' });
    expect(post.status).toBe(404);
    const get = await request(app).get(`/api/events/${id}/registrations`);
    expect(get.status).toBe(404);
  });
});

describe('stats & misc', () => {
  test('returns dashboard stats', async () => {
    const upcoming = await createEvent({ date: '2099-01-01' });
    await createEvent({ date: '2000-01-01' });
    await request(app).post(`/api/events/${upcoming._id}/register`).send({ name: 'A', email: 'a@x.com' });
    const res = await request(app).get('/api/stats');
    expect(res.body).toEqual({ totalEvents: 2, totalRegistrations: 1, upcomingEvents: 1 });
  });

  test('invalid JSON returns 400 and unknown route 404', async () => {
    const bad = await request(app).post('/api/events').set('Content-Type', 'application/json').send('{bad');
    expect(bad.status).toBe(400);
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });
});
