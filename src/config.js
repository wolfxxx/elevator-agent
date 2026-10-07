// World units are roughly metres. y is up, x runs across the building, the camera looks down -z.
export const FH = 4;              // floor-to-floor height
export const HALF_W = 22;         // half interior width of the building
export const SLAB = 0.4;          // floor slab thickness
export const DEPTH = 5;           // interior depth; back wall sits at z = -DEPTH
export const FRONT = 0.6;         // slab front edge z
export const LANE_Z = -0.9;       // the z-lane characters walk on
export const CAR_H = 3.3;         // elevator car interior height
export const CAR_ROOF = CAR_H + 0.2; // standing height on top of a car, relative to its floor
export const SHAFT_W = 3.2;       // elevator shaft width
export const SHAFT_IN = SHAFT_W / 2 - 0.35; // |x - shaft.x| below this = standing "in" the shaft
export const PLAYER_H = 2.0;
export const DUCK_H = 1.15;
export const GRAVITY = 32;
export const JUMP_V = 9.5;
export const WALK = 5.4;
export const CAR_SPEED_PLAYER = 4.6;
export const CAR_SPEED_AI = 3.4;
export const PLAYER_BULLET_SPEED = 30;
export const MAX_PLAYER_BULLETS = 2;
export const NUM_FLOORS = 30;     // office floors 1..29 + garage (0); roof is index NUM_FLOORS
export const ESC_LEN = 6;         // horizontal run of an escalator
export const LAMP_Y = 3.15;       // lamp bulb height above its floor
export const GUN_Y = 1.42;
export const GUN_Y_DUCK = 0.78;
export const CAMERA_FOV = 38;

export const SCORE = { shot: 100, kick: 150, lamp: 150, lampCrush: 300, crush: 300, doc: 500, levelBase: 1000 };

// Enemy agents wear the arcade look: fedora + sunglasses (set false for the bare-headed agent)
export const AGENT_HAT_AND_SHADES = true;
