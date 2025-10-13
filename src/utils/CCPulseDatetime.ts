import {
  format as dateFnsFormat,
  parseISO,
  addDays as dateFnsAddDays,
  addHours as dateFnsAddHours,
  addMinutes as dateFnsAddMinutes,
  subDays as dateFnsSubDays,
  differenceInMilliseconds,
  isAfter,
  isBefore,
  isEqual
} from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * CC Pulse datetime utility class
 * Handles datetime operations with JST (Japan Standard Time, UTC+9) as default timezone
 */
export class CCPulseDatetime {
  private readonly date: Date;
  private static readonly JST_TIMEZONE = 'Asia/Tokyo';
  private static readonly DEFAULT_TIMEZONE = CCPulseDatetime.JST_TIMEZONE;

  /**
   * Constructor
   * @param date Date object, ISO string, or undefined (defaults to now)
   */
  constructor(date?: Date | string) {
    if (!date) {
      this.date = new Date();
    } else if (typeof date === 'string') {
      this.date = parseISO(date);
    } else {
      this.date = date;
    }
  }

  /**
   * Get current datetime (static factory method)
   */
  static now(): CCPulseDatetime {
    return new CCPulseDatetime();
  }

  /**
   * Create from ISO 8601 string (static factory method)
   * @param isoString ISO 8601 format string
   */
  static fromISO(isoString: string): CCPulseDatetime {
    return new CCPulseDatetime(isoString);
  }

  /**
   * Create from Date object (static factory method)
   */
  static fromDate(date: Date): CCPulseDatetime {
    return new CCPulseDatetime(date);
  }

  /**
   * Convert to ISO 8601 string with timezone
   * @returns ISO 8601 format string (e.g., "2025-10-04T09:00:00+09:00")
   */
  toISOString(): string {
    // Format: YYYY-MM-DDTHH:mm:ss+09:00
    return formatInTimeZone(this.date, CCPulseDatetime.DEFAULT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }

  /**
   * Convert to JST datetime string
   * @param formatString Custom format (default: "yyyy-MM-dd HH:mm:ss")
   * @returns Formatted string in JST
   */
  toJST(formatString: string = 'yyyy-MM-dd HH:mm:ss'): string {
    return formatInTimeZone(this.date, CCPulseDatetime.JST_TIMEZONE, formatString);
  }

  /**
   * Convert to Date object
   */
  toDate(): Date {
    return new Date(this.date);
  }

  /**
   * Format datetime with custom format string
   * @param formatString date-fns format string
   * @param timezone Timezone (default: JST)
   */
  format(formatString: string, timezone: string = CCPulseDatetime.DEFAULT_TIMEZONE): string {
    return formatInTimeZone(this.date, timezone, formatString);
  }

  /**
   * Get date in YYYY-MM-DD format (JST)
   */
  toDateString(): string {
    return this.toJST('yyyy-MM-dd');
  }

  /**
   * Get time in HH:mm:ss format (JST)
   */
  toTimeString(): string {
    return this.toJST('HH:mm:ss');
  }

  /**
   * Add days
   */
  addDays(days: number): CCPulseDatetime {
    return new CCPulseDatetime(dateFnsAddDays(this.date, days));
  }

  /**
   * Add hours
   */
  addHours(hours: number): CCPulseDatetime {
    return new CCPulseDatetime(dateFnsAddHours(this.date, hours));
  }

  /**
   * Add minutes
   */
  addMinutes(minutes: number): CCPulseDatetime {
    return new CCPulseDatetime(dateFnsAddMinutes(this.date, minutes));
  }

  /**
   * Subtract days
   */
  subDays(days: number): CCPulseDatetime {
    return new CCPulseDatetime(dateFnsSubDays(this.date, days));
  }

  /**
   * Check if this datetime is after another
   */
  isAfter(other: CCPulseDatetime): boolean {
    return isAfter(this.date, other.date);
  }

  /**
   * Check if this datetime is before another
   */
  isBefore(other: CCPulseDatetime): boolean {
    return isBefore(this.date, other.date);
  }

  /**
   * Check if this datetime is equal to another
   */
  isEqual(other: CCPulseDatetime): boolean {
    return isEqual(this.date, other.date);
  }

  /**
   * Get difference in milliseconds
   */
  diff(other: CCPulseDatetime): number {
    return differenceInMilliseconds(this.date, other.date);
  }

  /**
   * Get difference in seconds
   */
  diffInSeconds(other: CCPulseDatetime): number {
    return Math.floor(this.diff(other) / 1000);
  }

  /**
   * Get timestamp (milliseconds since Unix epoch)
   */
  getTime(): number {
    return this.date.getTime();
  }

  /**
   * Clone this datetime
   */
  clone(): CCPulseDatetime {
    return new CCPulseDatetime(new Date(this.date));
  }

  /**
   * Convert to JSON (returns ISO string)
   */
  toJSON(): string {
    return this.toISOString();
  }

  /**
   * String representation (returns ISO string)
   */
  toString(): string {
    return this.toISOString();
  }
}

/**
 * Helper function to create CCPulseDatetime instance
 */
export function datetime(date?: Date | string): CCPulseDatetime {
  return new CCPulseDatetime(date);
}

/**
 * Helper function to get current datetime
 */
export function now(): CCPulseDatetime {
  return CCPulseDatetime.now();
}
