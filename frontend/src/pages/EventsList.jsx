import { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import { api } from '../api/client.js';
import EventCard from '../components/EventCard.jsx';
import Loading from '../components/Loading.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import EmptyState from '../components/EmptyState.jsx';

export default function EventsList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, loading, error, reload } = useFetch(
    () => api.listEvents({ page, search }),
    [page, search]
  );

  const events = Array.isArray(data) ? data : data?.events || [];
  const totalPages = Array.isArray(data) ? 1 : data?.totalPages || 0;

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search by name or location..."
            value={search}
            onChange={handleSearchChange}
            aria-label="Search events"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-64"
          />
          <Link
            to="/events/new"
            className="inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New Event
          </Link>
        </div>
      </div>

      {loading && <Loading />}
      {error && <ErrorMessage message={error.message} onRetry={reload} />}

      {!loading && !error && events.length === 0 && (
        search.trim() ? (
          <EmptyState title="No events match your search">
            <p className="text-sm text-slate-500">
              No events found matching &ldquo;{search.trim()}&rdquo;. Try another search term.
            </p>
          </EmptyState>
        ) : (
          <EmptyState title="No events yet">
            <Link to="/events/new" className="text-indigo-600 underline">
              Create your first event
            </Link>
          </EmptyState>
        )
      )}

      {!loading && !error && events.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <EventCard key={e._id} event={e} />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages || 1}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

