  // Test 10: Manual reservation insertions & properties
  {
    console.log("Test 10: Manual reservation insertion properties");
    const newRes = {
      id: "res_123",
      trip_id: "trip_456",
      type: "Hospedagem",
      title: "Hotel Copacabana",
      provider: "Booking",
      reference: "ABC123XYZ",
      date: null,
      start_datetime: "2026-12-10T14:00",
      end_datetime: "2026-12-15T10:00",
      file_reference: null,
      source: "manual",
      status: "confirmed",
      is_favorite: false,
      created_at: new Date().toISOString()
    };
    
    // Check all required properties
    assert.strictEqual(newRes.id, "res_123");
    assert.strictEqual(newRes.trip_id, "trip_456");
    assert.strictEqual(newRes.type, "Hospedagem");
    assert.strictEqual(newRes.title, "Hotel Copacabana");
    assert.strictEqual(newRes.provider, "Booking");
    assert.strictEqual(newRes.reference, "ABC123XYZ");
    assert.strictEqual(newRes.is_favorite, false);
    
    // Simulate insertion
    const trip = { reservations: [] };
    trip.reservations.push(newRes);
    assert.strictEqual(trip.reservations.length, 1);
  }

  // Test 11: Search filtering & category filtering
  {
    console.log("Test 11: Search filtering & category filtering logic");
    const items = [
      { title: "Voo Paris", category: "Passagem Aérea", provider: "LATAM" },
      { title: "Hotel Centro", category: "Hospedagem", provider: "Booking" },
      { title: "Ingresso Museu", category: "Ingresso", provider: "Local" },
      { title: "Voo Volta", category: "Passagem Aérea", provider: "Air France" }
    ];
    
    // Filter by Category
    const categoryFilt = items.filter(i => i.category === "Passagem Aérea");
    assert.strictEqual(categoryFilt.length, 2);
    
    // Filter by Search text
    const searchQ = "paris".toLowerCase();
    const searchFilt = items.filter(i => `${i.title} ${i.provider}`.toLowerCase().includes(searchQ));
    assert.strictEqual(searchFilt.length, 1);
    assert.strictEqual(searchFilt[0].title, "Voo Paris");
  }

  // Test 12: Sorting logic
  {
    console.log("Test 12: Date-based and favorite-based sorting logic");
    let items = [
      { title: "C", is_favorite: false, category: "Z", start_datetime: "2026-10-12" },
      { title: "A", is_favorite: true, category: "A", start_datetime: "2026-10-10" },
      { title: "B", is_favorite: false, category: "A", start_datetime: "2026-10-11" }
    ];
    
    // Date sorting (closest first)
    items.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
    assert.strictEqual(items[0].title, "A");
    assert.strictEqual(items[1].title, "B");
    assert.strictEqual(items[2].title, "C");
    
    // Favorite + Category sorting
    items.sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return a.category.localeCompare(b.category);
    });
    assert.strictEqual(items[0].title, "A"); // favorite first
    assert.strictEqual(items[1].title, "B"); // then category A
    assert.strictEqual(items[2].title, "C"); // then category Z
  }

  // Test 13: Shared view file restriction policy
  {
    console.log("Test 13: Shared view file restriction policies");
    const items = [
      { id: "1", title: "Public doc", file_reference: null, url: "https://example.com/img.png" },
      { id: "2", title: "Private doc", file_reference: "user/123.pdf", url: "https://supabase.co/storage/v1/..." }
    ];
    
    const isSharedView = true;
    
    const processed = items.map(item => {
      const isSupabaseFile = item.file_reference || (item.url && item.url.includes("supabase.co"));
      return {
        ...item,
        blockView: isSharedView && isSupabaseFile
      };
    });
    
    assert.strictEqual(processed[0].blockView, false); // public allows view
    assert.strictEqual(processed[1].blockView, true); // private supabase restricted
  }
