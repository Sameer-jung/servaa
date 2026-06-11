    export const MESSAGES = {
    auth: {
        loginSuccess: 'Logged in successfully.',
        logoutSuccess: 'Logged out successfully.',
        registerSuccess: 'Account created successfully.',
        sessionExpired: 'Session expired. Please log in again.',
        invalidCredentials: 'Invalid email or password.',
        loginFailed: 'Unable to log in right now. Please try again.',
    },

    customerOrder: {
        placeSuccess: 'Order placed successfully.',
        sentToKitchen: 'Your order has been sent to the kitchen.',
        placeFailed: 'Unable to place order. Please try again.',
        itemsUnavailable: 'One or more items are unavailable. Please update your cart.',
    },

    staffOrder: {
        accepted: 'Order accepted.',
        rejected: 'Order rejected.',
        preparing: 'Order marked as preparing.',
        ready: 'Order marked as ready.',
        completed: 'Order completed successfully.',
        updateFailed: 'Unable to update order status. Please try again.',
    },

    serviceRequest: {
        waterSent: 'Water request sent.',
        billSent: 'Bill request sent.',
        sendFailed: 'Unable to send request. Please try again.',
    },

    tables: {
        addSuccess: 'Table added successfully.',
        qrGenerated: 'QR code generated successfully.',
        deleteSuccess: 'Table deleted successfully.',
        addFailed: 'Unable to add table.',
        qrFailed: 'Unable to generate QR code.',
        deleteFailed: 'Unable to delete table.',
    },

    menu: {
        categoryCreateSuccess: 'Category created successfully.',
        categoryUpdateSuccess: 'Category updated successfully.',
        categoryDeleteSuccess: 'Category deleted successfully.',
        itemCreateSuccess: 'Item created successfully.',
        itemUpdateSuccess: 'Item updated successfully.',
        itemDeleteSuccess: 'Item deleted successfully.',
        availabilityUpdated: 'Item availability updated.',
        saveFailed: 'Unable to save menu changes.',
    },

    billing: {
        invoiceGenerated: 'Invoice generated successfully.',
        invoiceSentToTable: 'Invoice sent to table.',
        markPaidSuccess: 'Invoice marked as paid.',
        statusUpdated: 'Invoice status updated successfully.',
        loadFailed: 'Unable to load invoices.',
        sendFailed: 'Unable to send invoice to table.',
        updateFailed: 'Unable to update invoice status.',
    },

    settings: {
        saveSuccess: 'Settings saved successfully.',
        saveFailed: 'Unable to save settings. Please try again.',
    },

    common: {
        unexpectedError: 'Something went wrong. Please try again.',
        networkError: 'Network error. Please check your connection and try again.',
        retry: 'Please try again.',
    },
    } as const