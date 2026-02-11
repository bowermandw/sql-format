create or alter procedure dbo.some_proc ( @param1 varchar(20), @param2 varchar(20))
as
begin
 select tbl1.column_1 AS some_alias1, tbl2.long_column_name_2 AS some_alias2, tbl1.aa_amount - tbl2.long_column_name_3 as col4
 from ( select [column_1], SUM([aa_amount]) AS [aa_amount]
  
 from some_long_table1
 group by [column_1]) tbl1
 inner join ( select column_1, long_column_name_2, long_column_name_3 from some_long_table2) tbl2
 on tbl1.column_1 = tbl2.column_1
 order by 1
 
end
go
