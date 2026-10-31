/*
 * Index tables for the share code (spec 2026-10-24 §5.4). APPEND-ONLY: an
 * index, once shipped, means that id forever. A new circuit, driver or team is
 * appended; nothing is ever removed or reordered (pinned by startCode.test).
 */
export const CIRCUIT_CODES = ['bengaluru', 'monsoon_bay', 'veloce', 'harbour_lights', 'sol_desert', 'highland', 'grand_savane', 'aurora', 'silverpark', 'costa_verde', 'kaido', 'altiplano', 'lantern_quay', 'mesa_roja'] as const
export const DRIVER_CODES = ['d_voss', 'd_chen', 'd_rossi', 'd_haas', 'd_silva', 'd_park', 'd_berg', 'd_almeida', 'd_novak', 'd_ito', 'd_dubois', 'd_mwangi', 'd_olsen', 'd_reyes', 'd_fischer', 'd_kovac', 'd_santos', 'd_tan', 'd_petrov', 'd_kane'] as const
export const TEAM_CODES = ['apex', 'meridian', 'vortex', 'kestrel', 'solstice', 'delta', 'halcyon', 'nimbus', 'terra', 'zenith'] as const
export const COMPOUND_CODES = ['S', 'M', 'H', 'I', 'W'] as const
export const PACE_CODES = ['push', 'neutral', 'conserve'] as const
export const LAPS_PERCENTS = [25, 50, 75, 100] as const
export const WEATHER_CODES = ['circuit', 'dry', 'changeable', 'wet'] as const
export const ATTRIBUTE_CODES = ['power', 'aero', 'handling', 'reliability', 'pace'] as const
export const CALL_KINDS = ['pit', 'pace', 'restart_tyre', 'hold_plan'] as const
