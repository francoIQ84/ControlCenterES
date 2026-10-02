import unittest
from src import database, tenancy

class TestUserNotifications(unittest.TestCase):
    def setUp(self):
        # Aseguramos tenant de prueba y limpiamos registros de notificaciones de prueba
        self.tenant_id = tenancy.MASTER_TENANT_ID
        self.user1_id = 1
        self.user2_id = 9999

        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM user_notification_reads WHERE user_id IN (%s, %s)", (self.user1_id, self.user2_id))

    def tearDown(self):
        with database.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM user_notification_reads WHERE user_id IN (%s, %s)", (self.user1_id, self.user2_id))

    def test_notifications_have_rich_details(self):
        res = database.get_system_notifications(user_id=self.user1_id)
        notifications = res.get('notifications', [])
        self.assertIsInstance(notifications, list)

        for n in notifications:
            self.assertIn('id', n)
            self.assertIn('category', n)
            self.assertIn('title', n)
            self.assertIn('details', n)
            self.assertIsInstance(n['details'], dict)

            if n['category'] == 'sales':
                self.assertIn('order_id', n['details'])
                self.assertIn('total_amount', n['details'])
                self.assertIn('items', n['details'])
            elif n['category'] == 'inventory':
                self.assertIn('ml_id', n['details'])
                self.assertIn('available_quantity', n['details'])
            elif n['category'] == 'inpi':
                self.assertIn('acta', n['details'])
                self.assertIn('asset_type', n['details'])

    def test_per_user_mark_read_isolation(self):
        res_initial = database.get_system_notifications(user_id=self.user1_id)
        notifs = res_initial.get('notifications', [])
        if not notifs:
            self.skipTest("No hay notificaciones en la base de datos para probar")

        test_notif = notifs[0]
        test_id = test_notif['id']

        # Marcamos como leída solo para User 1
        database.mark_notification_as_read(self.user1_id, test_id)

        # Verificamos estado para User 1
        res_u1 = database.get_system_notifications(user_id=self.user1_id)
        u1_notif = next((n for n in res_u1['notifications'] if n['id'] == test_id), None)
        self.assertIsNotNone(u1_notif)
        self.assertTrue(u1_notif['is_read'])

        # Verificamos que para User 2 la notificación permanece NO LEÍDA
        res_u2 = database.get_system_notifications(user_id=self.user2_id)
        u2_notif = next((n for n in res_u2['notifications'] if n['id'] == test_id), None)
        self.assertIsNotNone(u2_notif)
        self.assertFalse(u2_notif['is_read'])
        self.assertEqual(res_u2['unread_count'], len(res_u2['notifications']))

    def test_per_user_dismiss_isolation(self):
        res_initial = database.get_system_notifications(user_id=self.user1_id)
        notifs = res_initial.get('notifications', [])
        if not notifs:
            self.skipTest("No hay notificaciones en la base de datos para probar")

        test_notif = notifs[0]
        test_id = test_notif['id']

        # User 1 descarta la notificación
        database.dismiss_notification(self.user1_id, test_id)

        # Para User 1, ya no aparece en su lista activa
        res_u1 = database.get_system_notifications(user_id=self.user1_id)
        u1_ids = [n['id'] for n in res_u1['notifications']]
        self.assertNotIn(test_id, u1_ids)

        # Para User 2, la notificación sigue intacta y visible
        res_u2 = database.get_system_notifications(user_id=self.user2_id)
        u2_ids = [n['id'] for n in res_u2['notifications']]
        self.assertIn(test_id, u2_ids)

    def test_per_user_clear_all_isolation(self):
        res_initial = database.get_system_notifications(user_id=self.user1_id)
        notifs = res_initial.get('notifications', [])
        if not notifs:
            self.skipTest("No hay notificaciones en la base de datos para probar")

        # User 1 limpia todo
        database.clear_all_notifications(self.user1_id)

        res_u1 = database.get_system_notifications(user_id=self.user1_id)
        self.assertEqual(len(res_u1['notifications']), 0)
        self.assertEqual(res_u1['unread_count'], 0)

        # User 2 conserva todas sus notificaciones
        res_u2 = database.get_system_notifications(user_id=self.user2_id)
        self.assertGreater(len(res_u2['notifications']), 0)
        self.assertEqual(res_u2['unread_count'], len(res_u2['notifications']))

if __name__ == '__main__':
    unittest.main()
