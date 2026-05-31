    import { NextResponse } from "next/server";
    import { supabaseAdmin } from "@/lib/supabase/admin";
    import { isUuid, readTrimmedString } from "@/utils/validation";

    export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tableId = searchParams.get("tableId");
        const customerSessionId = readTrimmedString(
        searchParams.get("customerSessionId"),
        128,
        );

        if (!isUuid(tableId) || !customerSessionId) {
        return NextResponse.json(
            { error: "Invalid session order query" },
            { status: 400 },
        );
        }

        const { data: order, error } = await supabaseAdmin
        .from("orders")
        .select("*, items:order_items(*, menu_item:menu_items(name, price))")
        .eq("table_id", tableId)
        .eq("customer_session_id", customerSessionId)
        .in("status", ["pending", "accepted", "preparing", "ready"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

        if (error) {
        console.error("[orders.session.GET] order lookup error:", error.message);
        return NextResponse.json(
            { error: "Could not load active order." },
            { status: 500 },
        );
        }

        return NextResponse.json({ order: order || null });
    } catch (error) {
        console.error("[orders.session.GET] error:", error);
        return NextResponse.json(
        { error: "Failed to load active order" },
        { status: 500 },
        );
    }
    }
