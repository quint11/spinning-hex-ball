// --- Simulation Parameters ---
let gravitySlider, airFrictionSlider, elasticitySlider, bounceFrictionSlider, rotationSpeedSlider;
let gravityValueSpan, airFrictionValueSpan, elasticityValueSpan, bounceFrictionValueSpan, rotationSpeedValueSpan;

let gravity; // p5.Vector for gravity force
let airFrictionCoefficient; // Damping factor opposing velocity
let elasticity; // Coefficient of restitution (0=inelastic, 1=perfectly elastic)
let bounceFrictionCoefficient; // Friction during collision with wall (reduces tangential velocity)
let rotationSpeed; // Radians per frame

// --- Ball ---
let ball;
const ballRadius = 15;
const ballMass = 1; // Simple mass for force calculation

// --- Hexagon ---
let hexCenter;
let hexSize = 200; // Distance from center to vertex
let hexAngle = 0; // Current rotation angle
let hexVertices = []; // Array to hold p5.Vector vertices in world space

// --- Setup ---
function setup() {
    createCanvas(600, 650); // Extra height for controls potentially
    hexCenter = createVector(width / 2, height / 2 - 50); // Center the hexagon slightly higher

    // --- Initialize Ball ---
    ball = {
        pos: createVector(hexCenter.x, hexCenter.y - hexSize / 2), // Start near top center
        vel: createVector(0, 0),
        acc: createVector(0, 0),
        radius: ballRadius,
        mass: ballMass,
        color: color(255, 0, 0)
    };

    // --- Create Sliders and Labels ---
    createParameterControls();

    // Initial calculation of vertices
    updateHexagonVertices();
}

// --- Draw Loop ---
function draw() {
    background(240);

    // --- Read Slider Values ---
    updateParametersFromSliders();

    // --- Update Hexagon ---
    hexAngle += rotationSpeed;
    updateHexagonVertices(); // Recalculate rotated vertices

    // --- Update Ball Physics ---
    applyForces();
    updateBall();

    // --- Collision Detection & Response ---
    checkCollisions();

    // --- Draw Elements ---
    drawHexagon();
    drawBall();
    updateSliderLabels(); // Display current values
}

// --- Physics Functions ---

function applyForces() {
    // 1. Gravity
    let gravityForce = p5.Vector.mult(gravity, ball.mass); // F = m * g
    ball.acc.add(gravityForce.div(ball.mass)); // a = F / m (ends up just adding gravity vector)

    // 2. Air Friction (Damping) - proportional to velocity
    let frictionForce = ball.vel.copy();
    frictionForce.mult(-1); // Opposes velocity
    frictionForce.normalize(); // Direction
    frictionForce.mult(airFrictionCoefficient * ball.vel.mag()); // Magnitude scales with velocity
    ball.acc.add(frictionForce.div(ball.mass)); // a = F / m
}

function updateBall() {
    ball.vel.add(ball.acc);
    ball.pos.add(ball.vel);
    ball.acc.mult(0); // Reset acceleration for the next frame
}

// --- Collision Detection & Response ---

function checkCollisions() {
    for (let i = 0; i < hexVertices.length; i++) {
        let v1 = hexVertices[i];
        let v2 = hexVertices[(i + 1) % hexVertices.length]; // Next vertex, wraps around

        // Check collision with the line segment (v1, v2)
        collideLine(v1, v2);
    }
}

function collideLine(p1, p2) {
    // Find the closest point on the infinite line defined by p1, p2 to the ball center
    let lineVec = p5.Vector.sub(p2, p1);
    let pointVec = p5.Vector.sub(ball.pos, p1);

    let lineLenSq = lineVec.magSq();
    if (lineLenSq < 0.00001) return; // Avoid division by zero for very short segments

    // Project pointVec onto lineVec
    let t = pointVec.dot(lineVec) / lineLenSq;

    // Clamp t to be between 0 and 1 to stay on the segment
    t = constrain(t, 0, 1);

    // Calculate the closest point on the line segment
    let closestPoint = p5.Vector.add(p1, lineVec.copy().mult(t));

    // Vector from closest point to ball center
    let distVec = p5.Vector.sub(ball.pos, closestPoint);
    let distance = distVec.mag();

    // --- Collision Detected ---
    if (distance < ball.radius) {
        // 1. Calculate Normal Vector (pointing away from the wall, into the ball)
        // Normal is perpendicular to lineVec, make sure it points towards ball
        let normal = distVec.copy().normalize(); // Vector from closest point to ball center IS the normal

        // 2. Calculate Wall Velocity at Closest Point
        // Wall velocity = angular velocity x vector from center to closest point
        // In 2D: v_wall = omega * (-ry, rx) where r = closestPoint - hexCenter
        let r = p5.Vector.sub(closestPoint, hexCenter);
        let wallVelocity = createVector(-r.y, r.x).mult(rotationSpeed);

        // 3. Calculate Relative Velocity
        let relativeVelocity = p5.Vector.sub(ball.vel, wallVelocity);

        // 4. Calculate Relative Velocity Component Normal to the Wall
        let normalVelocityMag = relativeVelocity.dot(normal);

        // Only bounce if the ball is moving towards the wall
        if (normalVelocityMag < 0) {
             // 5. Apply Elasticity (Coefficient of Restitution)
             // v_rel_normal_new = -elasticity * v_rel_normal_old
             let impulseMag = -(1 + elasticity) * normalVelocityMag;
             let impulse = p5.Vector.mult(normal, impulseMag);

             // Update relative velocity (normal component changes)
             let newRelativeVelocity = p5.Vector.add(relativeVelocity, impulse);

             // 6. Apply Bounce Friction (reduces tangential velocity)
             let tangent = createVector(-normal.y, normal.x); // Vector tangential to the wall
             let tangentVelMag = newRelativeVelocity.dot(tangent); // Tangential component magnitude

             // Apply friction opposing the tangential motion
             let frictionImpulseMag = -tangentVelMag * bounceFrictionCoefficient;
             // Clamp friction impulse - it can't exceed the impulse needed to stop tangential motion
             frictionImpulseMag = constrain(frictionImpulseMag, -abs(tangentVelMag), abs(tangentVelMag));

             let frictionImpulse = p5.Vector.mult(tangent, frictionImpulseMag);
             newRelativeVelocity.add(frictionImpulse); // Add friction effect


             // 7. Convert Back to Absolute Ball Velocity
             ball.vel = p5.Vector.add(newRelativeVelocity, wallVelocity);

             // 8. Positional Correction (prevent sinking)
             // Move ball slightly out of the wall along the normal
             let overlap = ball.radius - distance;
             ball.pos.add(normal.copy().mult(overlap * 1.01)); // Move slightly more than overlap
        }
    }
}


// --- Hexagon Functions ---

function updateHexagonVertices() {
    hexVertices = []; // Clear previous vertices
    for (let i = 0; i < 6; i++) {
        // Calculate vertex position relative to origin (0,0) at current angle
        let angle = TWO_PI / 6 * i + hexAngle;
        let x = hexCenter.x + hexSize * cos(angle);
        let y = hexCenter.y + hexSize * sin(angle);
        hexVertices.push(createVector(x, y));
    }
}

function drawHexagon() {
    stroke(0);
    strokeWeight(2);
    noFill();
    beginShape();
    for (let v of hexVertices) {
        vertex(v.x, v.y);
    }
    endShape(CLOSE);
}

// --- Ball Drawing ---

function drawBall() {
    noStroke();
    fill(ball.color);
    ellipse(ball.pos.x, ball.pos.y, ball.radius * 2, ball.radius * 2);
}


// --- UI Control Functions ---

function createParameterControls() {
    // Gravity
    let gDiv = select('#gravity-control');
    gDiv.html('<label>Gravity(重力):</label>');
    gravitySlider = createSlider(0, 0.5, 0.15, 0.01); // min, max, start, step
    gravitySlider.parent(gDiv);
    gravityValueSpan = createSpan('');
    gravityValueSpan.parent(gDiv);

    // Air Friction
    let afDiv = select('#air-friction-control');
    afDiv.html('<label>Air Friction(空气阻力):</label>');
    airFrictionSlider = createSlider(0, 0.1, 0.005, 0.001);
    airFrictionSlider.parent(afDiv);
    airFrictionValueSpan = createSpan('');
    airFrictionValueSpan.parent(afDiv);

    // Elasticity
    let eDiv = select('#elasticity-control');
    eDiv.html('<label>Elasticity Bounce(弹性):</label>');
    elasticitySlider = createSlider(0, 1, 0.7, 0.01);
    elasticitySlider.parent(eDiv);
    elasticityValueSpan = createSpan('');
    elasticityValueSpan.parent(eDiv);

     // Bounce Friction
    let bfDiv = select('#bounce-friction-control');
    bfDiv.html('<label>Bounce Friction(碰撞摩擦 ):</label>');
    bounceFrictionSlider = createSlider(0, 1, 0.1, 0.01); // How much tangential vel is lost
    bounceFrictionSlider.parent(bfDiv);
    bounceFrictionValueSpan = createSpan('');
    bounceFrictionValueSpan.parent(bfDiv);


    // Rotation Speed
    let rsDiv = select('#rotation-speed-control');
    rsDiv.html('<label>Rotation Speed(旋转速度):</label>');
    rotationSpeedSlider = createSlider(-0.05, 0.05, 0.01, 0.001);
    rotationSpeedSlider.parent(rsDiv);
    rotationSpeedValueSpan = createSpan('');
    rotationSpeedValueSpan.parent(rsDiv);
}

function updateParametersFromSliders() {
    gravity = createVector(0, gravitySlider.value()); // Gravity acts downwards
    airFrictionCoefficient = airFrictionSlider.value();
    elasticity = elasticitySlider.value();
    bounceFrictionCoefficient = bounceFrictionSlider.value();
    rotationSpeed = rotationSpeedSlider.value();
}

function updateSliderLabels() {
    gravityValueSpan.html(gravity.y.toFixed(2));
    airFrictionValueSpan.html(airFrictionCoefficient.toFixed(3));
    elasticityValueSpan.html(elasticity.toFixed(2));
    bounceFrictionValueSpan.html(bounceFrictionCoefficient.toFixed(2));
    rotationSpeedValueSpan.html(rotationSpeed.toFixed(3));
}