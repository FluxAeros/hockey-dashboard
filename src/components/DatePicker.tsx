import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface DatePickerProps {
  value: string;           // YYYY-MM-DD
  onChange: (date: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function DatePicker({ value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(0);
  const [viewMonth, setViewMonth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync the calendar view to the selected value whenever it opens
  const toggle = () => {
    if (!open) {
      const [y, m] = value.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
    setOpen((o) => !o);
  };

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const handleDayClick = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${viewYear}-${mm}-${dd}`);
    setOpen(false);
  };

  const [selYear, selMonth, selDay] = value.split("-").map(Number);
  const today = new Date();
  const daysInMonth = viewYear ? getDaysInMonth(viewYear, viewMonth) : 0;
  const firstDay   = viewYear ? getFirstDayOfMonth(viewYear, viewMonth) : 0;
  const monthLabel = viewYear
    ? new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "";

  const displayLabel = new Date(value + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <div className="datepicker-wrapper" ref={wrapperRef}>
      <button type="button" className="date-nav-display" onClick={toggle} aria-haspopup="dialog">
        <Calendar size={14} className="date-nav-icon" />
        {displayLabel}
      </button>

      {open && (
        <div className="datepicker-dropdown" role="dialog" aria-label="Choose date">
          {/* Month navigation */}
          <div className="datepicker-header">
            <button className="datepicker-nav" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className="datepicker-month-label">{monthLabel}</span>
            <button className="datepicker-nav" onClick={nextMonth} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="datepicker-weekdays">
            {WEEKDAYS.map((d) => (
              <span key={d} className="datepicker-weekday">{d}</span>
            ))}
          </div>

          {/* Day grid */}
          <div className="datepicker-grid">
            {/* Empty cells before the 1st */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                viewYear === selYear &&
                viewMonth === selMonth - 1 &&
                day === selDay;
              const isToday =
                today.getFullYear() === viewYear &&
                today.getMonth() === viewMonth &&
                today.getDate() === day;

              return (
                <button
                  key={day}
                  className={[
                    "datepicker-day",
                    isSelected ? "selected" : "",
                    isToday && !isSelected ? "today" : "",
                  ].join(" ").trim()}
                  onClick={() => handleDayClick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
