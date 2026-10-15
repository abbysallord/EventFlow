import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import EventForm from '../components/EventForm.jsx';
import RegistrationForm from '../components/RegistrationForm.jsx';
import EventCard from '../components/EventCard.jsx';
import EventsList from '../pages/EventsList.jsx';
import EventDetails from '../pages/EventDetails.jsx';

function mockFetch(status, body) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

afterEach(() => vi.restoreAllMocks());

describe('EventForm', () => {
  test('shows validation errors and does not submit an empty form', async () => {
    const onSubmit = vi.fn();
    render(<EventForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /save event/i }));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Date is required')).toBeInTheDocument();
    expect(screen.getByText('Capacity must be a positive whole number')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('submits cleaned values when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<EventForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Title'), '  Demo Day ');
    await userEvent.type(screen.getByLabelText('Date'), '2099-01-15');
    await userEvent.type(screen.getByLabelText('Time'), '10:00');
    await userEvent.type(screen.getByLabelText('Location'), 'Online');
    await userEvent.type(screen.getByLabelText('Organizer'), 'Team');
    await userEvent.type(screen.getByLabelText('Capacity'), '25');
    await userEvent.click(screen.getByRole('button', { name: /save event/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Demo Day', date: '2099-01-15', capacity: 25 })
    );
  });
});

describe('RegistrationForm', () => {
  test('rejects an invalid email without calling the API', async () => {
    mockFetch(201, {});
    render(<RegistrationForm eventId="abc" />);
    await userEvent.type(screen.getByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('shows success message after registering', async () => {
    mockFetch(201, { _id: '1' });
    const onRegistered = vi.fn();
    render(<RegistrationForm eventId="abc" onRegistered={onRegistered} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByText('Registration successful!')).toBeInTheDocument();
    expect(onRegistered).toHaveBeenCalled();
  });

  test('shows the server error for a duplicate registration', async () => {
    mockFetch(409, { error: 'This email is already registered for this event' });
    render(<RegistrationForm eventId="abc" />);
    await userEvent.type(screen.getByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already registered');
  });
});

describe('EventsList', () => {
  test('shows the empty state when there are no events', async () => {
    mockFetch(200, []);
    render(<MemoryRouter><EventsList /></MemoryRouter>);
    expect(await screen.findByText('No events yet')).toBeInTheDocument();
  });

  test('shows an error state when the API fails', async () => {
    mockFetch(500, { error: 'Internal server error' });
    render(<MemoryRouter><EventsList /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Internal server error'));
  });

  test('renders event cards', async () => {
    mockFetch(200, {
      events: [
        { _id: '1', title: 'Node Meetup', date: '2099-01-15T00:00:00.000Z', time: '18:30', location: 'Hyderabad', organizer: 'Org', capacity: 10 },
      ],
      page: 1,
      limit: 10,
      totalEvents: 1,
      totalPages: 1,
    });
    render(<MemoryRouter><EventsList /></MemoryRouter>);
    expect(await screen.findByText('Node Meetup')).toBeInTheDocument();
  });

  test('shows custom empty state when search returns no matching events', async () => {
    mockFetch(200, { events: [], page: 1, limit: 10, totalEvents: 0, totalPages: 0 });
    render(<MemoryRouter><EventsList /></MemoryRouter>);
    const searchInput = screen.getByLabelText(/search events/i);
    await userEvent.type(searchInput, 'Python');
    expect(await screen.findByText('No events match your search')).toBeInTheDocument();
    expect(screen.getByText(/no events found matching/i)).toBeInTheDocument();
  });

  test('renders pagination controls and handles page navigation', async () => {
    mockFetch(200, {
      events: [
        { _id: '1', title: 'Event 1', date: '2099-01-15T00:00:00.000Z', time: '18:30', location: 'Hyderabad', organizer: 'Org', capacity: 10 },
      ],
      page: 1,
      limit: 1,
      totalEvents: 2,
      totalPages: 2,
    });
    render(<MemoryRouter><EventsList /></MemoryRouter>);
    expect(await screen.findByText('Event 1')).toBeInTheDocument();

    const prevButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });

    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeEnabled();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await userEvent.click(nextButton);
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });
});

describe('EventCard', () => {
  test('links to the event details page', () => {
    const event = { _id: 'xyz', title: 'T', date: '2099-01-15T00:00:00.000Z', time: '09:00', location: 'L', organizer: 'O', capacity: 5 };
    render(<MemoryRouter><EventCard event={event} /></MemoryRouter>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/events/xyz');
  });
});

describe('EventDetails', () => {
  const event = { _id: 'e1', title: 'Node Meetup', description: '', date: '2099-01-15T00:00:00.000Z', time: '18:30', location: 'L', organizer: 'O', capacity: 5, registrationCount: 0 };

  function renderDetails() {
    render(
      <MemoryRouter initialEntries={['/events/e1']}>
        <Routes><Route path='/events/:id' element={<EventDetails />} /></Routes>
      </MemoryRouter>
    );
  }

  test('shows the not-found state for an unknown event', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Event not found' }) });
    renderDetails();
    expect(await screen.findByText('Event not found')).toBeInTheDocument();
  });

  test('keeps the success message after registering (page refreshes in the background)', async () => {
    let registered = false;
    globalThis.fetch = vi.fn(async (url, opts) => {
      await new Promise((r) => setTimeout(r, 30)); // real network latency makes a loading state visible
      const ok = (body, status = 200) => ({ ok: true, status, json: async () => body });
      if (opts?.method === 'POST') { registered = true; return ok({ _id: 'r1' }, 201); }
      if (url.endsWith('/registrations')) return ok(registered ? [{ _id: 'r1', name: 'Asha', email: 'asha@example.com', registeredAt: '2026-01-01T00:00:00Z' }] : []);
      return ok({ ...event, registrationCount: registered ? 1 : 0 });
    });
    renderDetails();
    await userEvent.type(await screen.findByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByText('Registration successful!')).toBeInTheDocument();
    expect(await screen.findByText('asha@example.com')).toBeInTheDocument();
    expect(screen.getByText('Registration successful!')).toBeInTheDocument();
  });
});
