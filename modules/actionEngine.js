export const VALID_ACTION_TYPES = [
  'itinerary', 'packing', 'expenses', 'flights', 'reservations', 'budget', 'preferences'
];

export function validateAction(action, trip) {
  if (!action || typeof action !== 'object') {
    throw new Error("Action must be an object.");
  }
  if (!VALID_ACTION_TYPES.includes(action.type)) {
    throw new Error(`Invalid action type: ${action.type}`);
  }
  if (action.data && (action.data.id !== undefined || action.data.ownership !== undefined || action.data.auth !== undefined)) {
    throw new Error("Action contains forbidden fields (id, ownership, auth).");
  }
  return true;
}

export function applyActions(actions, trip) {
  if (!Array.isArray(actions)) {
    throw new Error("actions must be an array");
  }

  // Deep copy for atomicity
  const newTrip = JSON.parse(JSON.stringify(trip));
  
  if (!newTrip.undoStack) {
    newTrip.undoStack = [];
  }
  
  // Save current state to undo stack, omitting the stack itself
  const stateSnapshot = { ...newTrip };
  delete stateSnapshot.undoStack;
  newTrip.undoStack.push(JSON.stringify(stateSnapshot));
  
  if (!newTrip.activity_log) {
    newTrip.activity_log = [];
  }

  for (const action of actions) {
    validateAction(action, newTrip);
    
    // Apply based on type
    const { type, operation, data, index } = action;
    
    switch (type) {
      case 'itinerary':
        if (operation === 'add') {
          newTrip.itinerary = newTrip.itinerary || [];
          newTrip.itinerary.push(data);
        } else if (operation === 'update') {
          if (index !== undefined && newTrip.itinerary && newTrip.itinerary[index]) {
            newTrip.itinerary[index] = { ...newTrip.itinerary[index], ...data };
          }
        } else if (operation === 'delete') {
          if (index !== undefined && newTrip.itinerary) {
            newTrip.itinerary.splice(index, 1);
          }
        } else if (operation === 'replace') {
          newTrip.itinerary = data;
        }
        break;

      case 'packing':
        if (operation === 'add') {
          newTrip.packing = newTrip.packing || [];
          newTrip.packing.push(data);
        } else if (operation === 'update') {
          if (index !== undefined && newTrip.packing && newTrip.packing[index]) {
            newTrip.packing[index] = { ...newTrip.packing[index], ...data };
          }
        } else if (operation === 'delete') {
          if (index !== undefined && newTrip.packing) {
            newTrip.packing.splice(index, 1);
          }
        } else if (operation === 'replace') {
          newTrip.packing = data;
        }
        break;

      case 'expenses':
        if (operation === 'add') {
          newTrip.expenses = newTrip.expenses || [];
          newTrip.expenses.push(data);
        } else if (operation === 'replace') {
          newTrip.expenses = data;
        }
        break;

      case 'flights':
        if (operation === 'add') {
          newTrip.flights = newTrip.flights || [];
          newTrip.flights.push(data);
        } else if (operation === 'replace') {
          newTrip.flights = data;
        } else if (operation === 'delete') {
          if (index !== undefined && newTrip.flights) {
            newTrip.flights.splice(index, 1);
          }
        }
        break;
        
      case 'reservations':
        if (operation === 'add') {
          newTrip.reservations = newTrip.reservations || [];
          newTrip.reservations.push(data);
        } else if (operation === 'replace') {
          newTrip.reservations = data;
        } else if (operation === 'delete') {
          if (index !== undefined && newTrip.reservations) {
            newTrip.reservations.splice(index, 1);
          }
        }
        break;

      case 'budget':
        if (operation === 'update' || operation === 'replace') {
          newTrip.budget = { ...newTrip.budget, ...data };
        }
        break;
        
      case 'preferences':
        if (operation === 'update' || operation === 'replace') {
          newTrip.preferences = { ...newTrip.preferences, ...data };
        }
        break;
    }
    
    // Log the action
    newTrip.activity_log.push({
      timestamp: new Date().toISOString(),
      action: action
    });
  }

  // If we reach here, all actions applied successfully
  return newTrip;
}

export function undoLastActions(trip) {
  if (!trip.undoStack || trip.undoStack.length === 0) {
    throw new Error("No states in undo stack.");
  }
  const lastStateStr = trip.undoStack.pop();
  const lastState = JSON.parse(lastStateStr);
  lastState.undoStack = trip.undoStack; // restore the modified stack
  return lastState;
}

export function buildTripContext(trip) {
  // Optimized token summary
  const summary = {
    title: trip.tripTitle,
    destination: trip.destination,
    dates: trip.infoDates,
    budget: trip.budget,
    flightsCount: (trip.flights || []).length,
    itineraryDays: (trip.itinerary || []).length,
    packingItems: (trip.packing || []).length
  };
  return JSON.stringify(summary);
}
