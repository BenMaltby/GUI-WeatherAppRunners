import { useEffect, useRef, useState } from "react";
import { searchLocations } from "../services/openMeteo";
import { parseLatLng } from "../services/locationSearch";

// Normalises location text so matching is more reliable even if the user
// types different capital letters or spacing.
function normalizeLocationText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Scores preset locations so the closest local matches can appear before
// the live API results when the user types.
function scorePresetLocationMatch(locationName, query) {
  const normalizedName = normalizeLocationText(locationName);
  const normalizedQuery = normalizeLocationText(query);
  const queryParts = normalizedQuery.split(",").map((part) => part.trim()).filter(Boolean);

  if (!normalizedQuery) {
    return -1;
  }

  let score = 0;

  if (normalizedName === normalizedQuery) score += 200;
  if (normalizedName.startsWith(normalizedQuery)) score += 120;
  if (normalizedName.includes(normalizedQuery)) score += 80;

  queryParts.forEach((part, index) => {
    if (normalizedName.includes(part)) {
      score += 35;
    }

    if (index === 0 && normalizedName.startsWith(part)) {
      score += 50;
    }
  });

  return score;
}

export default function LocationAutocompleteInput({
  label,
  query,
  resolvedLocation,
  onQueryChange,
  onResolvedChange,
  presetLocations,
  placeholder,
  error,
  onEnter,
  onGeo,
  showGeo = false,
  wrapperClassName = "",
  rowClassName = "",
  labelClassName = "",
  inputClassName = "",
  errorClassName = "",
  resolvedClassName = "",
  geoButtonClassName = "",
}) {
  // Keeps track of the text shown in the input, the suggestions list,
  // and whether the dropdown/loading state should be visible.
  const [inputValue, setInputValue] = useState(query ?? resolvedLocation?.name ?? "");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // If the parent updates the query or resolved location, the input also
  // needs to stay in sync with that latest value.
  useEffect(() => {
    setInputValue(query ?? resolvedLocation?.name ?? "");
  }, [query, resolvedLocation]);

  // Closes the dropdown if the user clicks anywhere outside the input area.
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // This effect handles autocomplete searching. It ignores very short input
  // and coordinate input, waits briefly so it does not search on every
  // keystroke instantly, then merges preset locations with live API results.
  useEffect(() => {
    const trimmed = inputValue.trim();

    if (resolvedLocation && trimmed === resolvedLocation.name) {
      return;
    }

    if (parseLatLng(trimmed) || trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      setSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setSuggestionsLoading(true);

        const localMatches = presetLocations
          .map((location) => ({
            location,
            score: scorePresetLocationMatch(location.name, trimmed),
          }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ location }) => location)
          .slice(0, 4);

        const liveMatches = await searchLocations(trimmed, 8);
        const merged = [...localMatches];

        liveMatches.forEach((location) => {
          const exists = merged.some(
            (item) =>
              item.name.toLowerCase() === location.name.toLowerCase() &&
              Math.abs(item.lat - location.lat) < 0.0001 &&
              Math.abs(item.lng - location.lng) < 0.0001
          );

          if (!exists && merged.length < 8) {
            merged.push(location);
          }
        });

        if (!cancelled) {
          setSuggestions(merged);
          setShowDropdown(merged.length > 0);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setShowDropdown(false);
        }
      } finally {
        if (!cancelled) {
          setSuggestionsLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [inputValue, presetLocations, resolvedLocation]);

  // Updates the input value as the user types and also supports manual
  // latitude/longitude input by resolving it immediately.
  const handleChange = (event) => {
    const value = event.target.value;
    const trimmed = value.trim();

    setInputValue(value);
    onQueryChange(value);
    onResolvedChange(null);

    const parsed = parseLatLng(trimmed);
    if (parsed) {
      onResolvedChange({ name: trimmed, lat: parsed.lat, lng: parsed.lng });
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  // When a suggestion is chosen, store it as the resolved location and
  // close the dropdown.
  const handleSelect = (location) => {
    setInputValue(location.name);
    onQueryChange(location.name);
    onResolvedChange(location);
    setSuggestions([]);
    setShowDropdown(false);
  };

  // Handles a couple of keyboard shortcuts for better usability.
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setShowDropdown(false);
    }

    if (event.key === "Enter" && onEnter) {
      onEnter();
    }
  };

  return (
    <div className={wrapperClassName}>
      {label && <label className={labelClassName}>{label}</label>}

      <div className={rowClassName}>
        <div className="autocomplete-container">
          <input
            ref={inputRef}
            className={`${inputClassName}${error ? " input-error" : ""}`}
            type="text"
            placeholder={placeholder}
            value={inputValue}
            onChange={handleChange}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />

          {showDropdown && (
            <ul className="suggestions-dropdown" ref={dropdownRef}>
              {suggestionsLoading && suggestions.length === 0 && (
                <li className="suggestion-status">Searching locations…</li>
              )}

              {suggestions.map((location, index) => (
                <li
                  key={`${location.name}-${location.lat}-${location.lng}-${index}`}
                  className="suggestion-item"
                  onMouseDown={() => handleSelect(location)}
                >
                  <span className="suggestion-name">{location.name}</span>
                  <span className="suggestion-coords">
                    {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {showGeo && (
          <button className={geoButtonClassName} onClick={onGeo} title="Use my location">
            📍
          </button>
        )}
      </div>

      {error && <p className={errorClassName}>{error}</p>}
      {resolvedLocation && (
        <p className={resolvedClassName}>
          {resolvedLocation.lat.toFixed(4)}, {resolvedLocation.lng.toFixed(4)}
        </p>
      )}
    </div>
  );
}
